# High School Football: Feasibility Report

Research only. No code changes, commits or deploys. Tested from the box with curl on **Thu Oct 29, 2026, about 8:10–8:40 AM MDT**.
Labels: **TESTED** means I hit the endpoint today and give the result. **READ** means I read the page or terms today. **UNTESTED** means a claim from docs or search results that I did not verify by calling it.

Justin's request (pt43u): "Add high school football with stars from all over including max preps and if there is a live game on local/cable/youtube."

---

## TL;DR

| Feature | Best legitimate source | Works? | Terms caveat | Ship in release? |
|---|---|---|---|---|
| National HS scores/schedules | None free and licensed. MaxPreps has the data but forbids automated access. ScoreStream sells an API (paid). | MaxPreps pages load (TESTED, 200), but the terms forbid scraping. ESPN has **no** HS scoreboard (TESTED, 400). | MaxPreps ToU: noncommercial use only, no robots or scrapers | **No.** Show "not available" and link out to MaxPreps |
| National rankings (MaxPreps Top 25 etc.) | MaxPreps, On3/Rivals HSFB, ESPN SC Next Top 25 (articles) | Pages load (TESTED). No API or RSS (MaxPreps /rss/ 404) | All three ban scraping | **No.** Link out only |
| Utah scores | uhsaa.org scoreboard ("updated hourly from MaxPreps") | **Yes** (TESTED: 10 games on Oct 23, 2026) | No ToU page found. The data is MaxPreps-derived. Ask UHSAA first | **Yes, gated on UHSAA OK.** Otherwise link out |
| Utah rankings | UHSAA official Football RPI (used for playoff seeding) | **Yes** (TESTED: 6A final, Skyridge #1, RPI 0.807370, 8-1) | Same as above | **Yes, gated** |
| Utah brackets | UHSAA links to MaxPreps tournament pages | Links only | MaxPreps ToU | Link out |
| Star players / recruits | ESPN 300, 247Sports, On3/Rivals Industry, MaxPreps All-American | No usable API. ESPN recruiting pages return 202 to curl (bot wall); 247Sports returns 406; On3 page loads | ESPN (Disney), 247, On3 and MaxPreps terms all ban automated collection | **No data feed.** Link to the lists. Optionally show ESPN 300 ranks only where ESPN prints them in a press release (manual, cited) |
| Watch: ESPN networks | WatchESPN catalog "High School Football" (the app's `server/watch.js` already uses this API) | **Yes** (TESTED: 7 HS games with eventIds and network, e.g. NFL Academy (UK) vs IMG Academy (FL), ESPN2) | Same unofficial ESPN API the app already uses | **Yes** |
| Watch: KSL (Utah TV + YouTube) | KSL Sports YouTube channel RSS (no key) + KSL's published weekly streaming guide | RSS **yes** (TESTED: game videos like "American Fork vs. Skyridge - 6A Girls Volleyball Semifinal"). Live flag needs the YouTube Data API key (UNTESTED) | YouTube API ToS; KSL owns the content (link/embed only) | **Yes, as links** ("on KSL Sports YouTube"). Live badge only if an API key is added |
| Watch: NFHS Network | Public school/association pages | Page loads (TESTED, UHSAA page lists upcoming events). No public API | NFHS ToU bans automated access (READ) | **Link only:** "may stream on NFHS Network (subscription)" |
| Watch: local TV/cable in general | No national machine-readable source | n/a | n/a | **Not available** except ESPN and KSL |

**Recommendation:** one release, **v1.6.0 "Single Wing"**: **Utah HS Football + national TV games**. Details in §7.

---

## 1. ESPN

**ESPN has no high school football scoreboard, teams or league API.**
- TESTED: `site.api.espn.com/apis/site/v2/sports/football/high-school-football/scoreboard`: **400** `{"code":400,"message":"Failed to get events endpoint."}`. `hs-football`: same 400.
- TESTED: `sports.core.api.espn.com/v2/sports/football/leagues` lists only cfl, college-football, nfl, ufl, xfl. `.../leagues/high-school-football`: **400** "Invalid sport/league combination". So do `hs-football`, `high-school` and `prep-football`.
- TESTED: the CFB scoreboard on Aug 29, 2026 (the day of three ESPN HS Kickoff games) returned 8 college events and no HS games. HS games are not tucked into the CFB feed.

**The WatchESPN catalog does carry HS football broadcasts.** This is the same `watch.product.api.espn.com/.../watchespn/web` API that `server/watch.js` already uses.
- TESTED: `/home` → `Leagues` bucket contains **"High School Football"** (48 leagues total). Its catalog `.../catalog/14743839-07ed-3b13-8feb-08378027f4e4` returned 200 with an "On Demand" bucket of 7 games, each with a network and an ESPN eventId:
  - NFL Academy (UK) vs. IMG Academy (FL): ESPN2, 2026-10-16 17:00 ET (3:00 PM MDT), eventId 401929578
  - Blue Springs (MO) vs. Liberty (MO): ESPN+, 2026-10-23 20:00 ET (6:00 PM MDT), eventId 401877220
  - plus 5 more Missouri ESPN+ games (Liberty / Liberty North / Lee's Summit / Kearney / Park Hill / Oak Park)
- TESTED: those eventIds do **not** resolve in any score/summary API (CFB summary 404, NFL summary 404, core events 404). So ESPN gives the **listing, network, time and watch link, but no score**.
- Today the catalog had no "Live"/"Upcoming" bucket, only replays. Whether upcoming HS games appear there ahead of time is **UNTESTED**. It likely works the same as the other leagues `watch.js` indexes, but I can't verify that until the next live window.
- The ESPN High School Football Kickoff 2026 (READ, ESPN Press Room) was 7 games, Aug 20–29, on ESPN/ESPN2. Examples: Brentwood Academy at Baylor School (Aug 20, ESPN2); Gainesville at Buford (Aug 22, ESPN2); Bishop Gorman vs Christopher Columbus (Aug 29, ESPN2); Chandler at Basha (Aug 29, ESPN). These were in the Watch schedule, not a scoreboard.
- ESPN search API (`site.web.api.espn.com/apis/search/v2?query=high school football`) TESTED 200. It returns articles, replays (e.g. "6-Man Football") and clips. These are useful as HS news links, not data.
- **Terms caveat (applies to the whole app, not just HS):** Disney's Terms of Use (READ, disneytermsofuse.com) prohibit extracting content "using a robot, spider, script, or other automated means ... data mining or web scraping." The app already depends on ESPN's unofficial JSON. HS adds no new kind of risk, but Justin should know it.

## 2. MaxPreps

- **Official API: none.** MaxPreps Support (READ via search, "Stat Import Partners," Aug 6, 2026): "We do not provide an API for stat partners." Data flows *into* MaxPreps from coaches, GameChanger and 80+ stat partners, not out.
- **RSS:** TESTED `maxpreps.com/rss/` → 404; `/news/rss.xml` → 404. No feed found.
- **Pages:** TESTED `maxpreps.com/football/rankings/1/` → 200 (national rankings), `/ut/football/rankings/1/` → 200, `/ut/football/scores/` → 200, `Index-Sitemap.xml` → 200.
- **robots.txt (TESTED):** disallows `/school/`, `/team/`, `/contest/`, `/scores/` (only the bare `/scores/` root allowed), `/association/`, `/careerprofile/`, `/local/` and `/proxy*`. Team pages and game ("contest") pages are off-limits to crawlers.
- **Terms of Use (READ, maxpreps.com/terms-of-use, operated by 2080 Media):** the Platform is for "your informational, **noncommercial** use." You may not "Use any **robot, spider, scraper**, or other automatic or manual means to access, monitor, or copy the Platform or its Content or data" or "Engage in unauthorized spidering, 'scraping,' data mining, or harvesting." 
- Third-party "MaxPreps API" wrappers exist (e.g. parse.bot). They are unofficial scrapers and do not make it permitted.
- **Verdict:** pulling MaxPreps scores, schedules or rankings into the app is **not permitted**. Legitimate uses: **link** to MaxPreps pages (rankings, team pages, state scoreboards). A licensed feed would mean contacting MaxPreps/2080 Media. Whether they license data is UNTESTED and unknown.

## 3. Star players / recruits

| Source | Data access | Terms | Result |
|---|---|---|---|
| ESPN 300 / Junior 300 | No JSON endpoint found. TESTED: `.../college-football/recruiting/rankings`: 404; `.../recruits`: 500; espn.com recruiting page returns 202 with an empty body to curl (bot challenge) | Disney ToU bans automated extraction | No feed |
| 247Sports Composite | TESTED: page returns **406** to curl. robots.txt disallows `*.json` | ToU (search result summary of 247sports.com/article/terms-of-service-34) bans robots/spiders and copying without written consent. I did not read the full text directly (406) | No feed |
| On3 / Rivals Industry (Rivals now lives at on3.com/rivals) | TESTED: `on3.com/rivals/rankings/industry-player/football/2027/` → 200, 2,764 athletes, "Last update 10/29/26". robots.txt allows `*`. Rivals robots has `Content-Signal: ... use=reference` | **On3 ToS (READ):** "personal, non-commercial" license; you may not "Monitor, scrape, crawl, mine, or collect data ... by using any automated tool"; no framing | No feed (robots allows crawl, ToS forbids it) |
| MaxPreps All-American / player pages | `/careerprofile/` disallowed in robots | MaxPreps ToU above | No feed |

**Verdict:** no source allows automated use of a national stars list. Honest options:
1. A **"Top recruits" link card** pointing to ESPN 300, 247 Composite, On3 Industry and MaxPreps All-America. No names or ranks get copied.
2. In-game context **from ESPN's own published text only.** Example: the Kickoff press release names "No. 14 overall ranked player ... David Gabriel Georges" (ESPN 300). This would be manual, sourced and dated. It can't be automated, so I'd leave it out of v1.6 unless Justin wants a hand-curated list with citations.
3. A paid licence. Not investigated beyond the terms.

## 4. Live / where to watch

**What can be detected automatically:**
- **ESPN/ESPN2/ESPNU/ESPN+ HS games:** yes, through the WatchESPN "High School Football" catalog (TESTED above). This adds one league name to `LEAGUES` in `watch.js`. Because those eventIds have no score API, they need their own "TV games" list.
- **KSL Sports YouTube (Utah):** channel `UCyIZoJ7Ge36sqkMPV_eKGfg`, linked from KSL's streaming page.
  - TESTED keyless RSS `youtube.com/feeds/videos.xml?channel_id=UCyIZoJ7Ge36sqkMPV_eKGfg` → 200. Recent entries included "American Fork vs. Skyridge - 6A Girls Volleyball Semifinal" (published 2026-10-29 06:27 UTC = Oct 29, 12:27 AM MDT) and "WATCH LIVE: The KSL Sports Zone."
  - RSS has no reliable live/upcoming flag. Titles follow "Team vs. Team - …", so matching them to a game is **heuristic**. A badge should only show on an exact two-team plus date match, linked to the video, and never be guessed.
  - The live/upcoming flag needs the **YouTube Data API** (`videos.list` with `liveStreamingDetails`; up to 50 IDs per call). The quota page (READ today) says the default is 10,000 units/day, `videos.list` costs 1, and `search.list` now has its own bucket of 100 calls/day. Needs a Google Cloud API key in Render env (Justin's action). **UNTESTED** (no key). YouTube API Services Terms/Developer Policies apply (attribution, data freshness). I did not re-read them this turn.
- **NFHS Network:** no public schedule API (search found only support docs saying schedules go through Console/email). An undocumented `cfunity.nfhsnetwork.com/v2/game_or_event/{id}` returns event JSON (TESTED 200 for a 2021 event). But NFHS robots.txt disallows `/v2/` and **NFHS ToU (READ) prohibits "accessing the website through any automated means, like scripts or web crawlers."** Games are mostly paywalled. → **Link only**, e.g. "School streams may be on NFHS Network: nfhsnetwork.com/associations/uhsaa" (TESTED 200; it lists upcoming Utah events, currently basketball).

**What can only be linked or shown as unavailable:**
- Local broadcast TV and cable in general: no national machine-readable source. Show **"TV: not listed"** rather than guessing.
- KSL 5.3 over-the-air/Comcast (Game Night Live, Thu + Fri). KSL publishes "weekly updated streaming guides" as articles (READ, sports.ksl.com Aug 2026), not as a feed. Show a static "KSL 5.3 / KSL Sports app / YouTube" link on the Utah page. Per-game TV only when the YouTube match above confirms it.
- UHSAA announces championships are exclusive to KSL Sports TV and streaming (READ, KSL, Aug 2026). That makes a safe static note on Utah playoff/championship games: "State championships air on KSL Sports" (with source link).

## 5. Utah / UHSAA (best local source)

- `uhsaa.org/scores/?sid=1&sport=Football&season=Fall&date=MM_DD_YYYY` (server-rendered HTML; TESTED 200). The page says "**Scores are updated hourly from MaxPreps.**" Oct 23, 2026 returned 10 playoff games with time, school, classification and score. Examples: "St. Joseph 84 vs Altamont 30 (8 Man)", "Grantsville 55 vs Ben Lomond 6 (3A)". Oct 29 returned "No games found" (correct: next round is Oct 30).
- `uhsaa.org/rpi/football/2026/{8player,1A..6A}final.php` (HTML fragments; TESTED 200): official RPI with Rank/School/RPI/WP/OWP/OOWP/W-L. 6A: 1 Skyridge 0.807370 (8-1), 2 Mountain Ridge 0.783619 (10-0), 3 Corner Canyon 0.704839 (8-2).
- Brackets: uhsaa.org links to MaxPreps tournament pages, so link out.
- robots.txt (TESTED): disallows `/v2/` (WordPress assets) and admin paths. `/scores/` and `/rpi/` are **not** disallowed.
- Terms: no Terms of Use page found (`/terms-of-use/` 404, none in the footer). That means no stated permission either. Because the scores are MaxPreps-derived, **recommend emailing UHSAA** (801-566-0681, 199 E Fort Union Blvd, Midvale) to ask whether a free, non-commercial app may show its scoreboard/RPI with attribution and links. Be polite: cache for ≥15 min and send a few requests per hour.
- **Data-quality example (why the app must cite its source):** for the same game, UHSAA/MaxPreps shows **Ogden 42, Union 3** (Oct 23), while Deseret News (Oct 17 article, updated) lists "No. 7 Ogden 7, No. 10 Union 3." One of them is wrong. The app should show the source ("UHSAA / MaxPreps") on every score and never "correct" it.
- Not explored: "UHSAA Live" mobile app (its API is unknown and probably not public), KSL's scoreboard widget source (UNTESTED).

## 6. Other options checked

- **ScoreStream** (READ: partner pages + API blog): free embeddable scoreboard widgets for publishers. Its JSON/WebSocket API is **commercial** (fee by volume/market; contact partner@scorestream.com). The data is crowd-sourced (10–15k HS games/week). This is the only legitimate route found to **national** live HS scores. A widget embed is free but brings their branding, ads and an iframe, which works against the app's low-bias, no-tracking style. Widget terms not reviewed. UNTESTED.

## 7. Recommended scope: v1.6.0 "Single Wing" (Utah HS Football + national TV games)

In:
1. **New sport `hsfb` (off by default),** Utah-first.
   - Scores tab from the UHSAA scoreboard, by date and classification, with "Source: UHSAA (data from MaxPreps)" and a link on every game. **Gate behind UHSAA permission.** If they say no or don't answer, ship the tab as link-outs.
   - Rankings tab: official UHSAA RPI by class.
   - Bracket: link to the UHSAA/MaxPreps bracket.
2. **"On TV nationally"** list from the WatchESPN "High School Football" catalog. Shows network, time in MT and the ESPN watch link. Scores show as "Score not available from ESPN". Add `hsfb: ['High School Football']` to `watch.js`.
3. **Watch-where on Utah games:**
   - "KSL Sports (YouTube)" link only when a KSL channel video title matches both teams and the date.
   - Static, sourced note: championships air on KSL.
   - Generic "may stream on NFHS Network" link-out.
   - Otherwise "TV: not listed."
   - The live/upcoming badge from the YouTube Data API only if Justin adds a key (optional, flag-guarded).
4. **"National" card of link-outs**, clearly labeled as external: MaxPreps national and state rankings and scores, ESPN SC Next Top 25 / ESPN 300, 247 Composite, On3 Industry, NFHS Network.

Out (shown as "not available", never estimated):
- National scores and schedules for all states (no licensed free source; MaxPreps and On3 forbid scraping).
- MaxPreps Top 25 / state rankings data in-app (link only).
- National star players / recruit rankings data (link only).
- Player stats, rosters, box scores, play-by-play for HS games.
- Automatic local TV or cable listings outside ESPN and KSL; NFHS per-game detection.

Future, if Justin wants national coverage: price a ScoreStream API licence, or ask MaxPreps/2080 Media about licensing.
