# Changelog

Releases get a vintage-sports nickname plus a version label (service-worker cache version in parentheses).

## v1.5.0 "Rabbit Ears" (ss-v28) — 2026-10-28

**LOCAL ONLY: not pushed, not deployed, waiting for Justin's approval.** Live is still v1.4.0 "Hail Mary" (ss-v27). QA: full run 208/210; the 2 failures (SY-04 outdated expectation, SY-08 flaky tap) were fixed and pass in filtered reruns. Report: `QA-REPORT-rabbit-ears.md`.

### Added / changed
- **Logo contrast (Justin: Panthers/Raiders vanish on the Broncos schedule's navy backdrop).** New `public/logotone.js` measures every team logo against the surface it sits on, in the browser (canvas, cached). A logo passes when at least 50% of its silhouette edge reaches **3:1** (WCAG 2.x SC 1.4.11; a pixel within 2 px at 48 px scale counts, so thin keylines aren't penalised) **and** at least 15% of its pixels reach 3:1. When a logo fails, it gets a 1px opposite-tone outline: `img.lt-lift` on dark surfaces, `img.lt-sink` on light. Logos that pass are untouched. Dark surfaces use ESPN's `500-dark` art; the team header keeps its white tile. `data-lt-skip` opts an image out.
  - Audit across all three surfaces (dark, light, team backdrop): 1612 logos, 1482 pass everywhere, 127 outlined, 0 under 3:1 after the fix. 3 crests can't be measured because their hosts send no CORS headers.
  - Files: `scripts/audit-logo-contrast.js` produces `docs/logo-audit.{json,md}` and `screenshots/v22/logo-contact-sheet.png`.
- **Search.** `server/search.js` builds a server-side index, merged with ESPN's athlete search. It covers:
  - golf: full PGA TOUR, LIV, LPGA and DP World lists;
  - tennis: ESPN's ATP and WTA list;
  - every NFL, MLB, NBA, WNBA, NHL and soccer roster;
  - college teams, including all 128 FCS teams via `/api/teams?sport=cfb&division=fcs` (searchable and followable);
  - AUSL.
- **Matching.** `public/fuzzy.js` and `public/aliases.js` make search accent- and punctuation-insensitive and tolerant of 1–2 typos (with a consonant-skeleton guard). They also recognise team nicknames such as Niners, Habs, Bama and Talons.
- **Golf ranking.** Players with an ESPN bio rank higher, so "McElroy" returns Rory McIlroy first.
- Tests: `tests/fuzzy.test.mjs`; `scripts/search-check.mjs` (116 known names, 116/116); browser QA `scripts/qa-v22.sh` adds LC-* and SR-* cases. Version 1.5.0, `?v=28`.

### Fixed
- Golf search index silently empty: a code line had been swallowed by a comment. It now logs a warning on load failure.
- QA: SY-04 no longer expects `public.profiles` to be absent, since the live app owns it after the v1.4.0 deploy. It now checks, read-only, that row count and max(updated_at) are unchanged and that no QA code hashes appear. `tests/sync-neon.test.js` was relaxed the same way. SY-08's submit tap has been hardened.

## v1.4.0 "Hail Mary" (ss-v27) — 2026-10-28

**Deployed Oct 28, 2026 (about 7:55 PM MT) as commit `1d9b70c` (Render deploy `dep-dbhaet0473hc739dmmh0`). Recovery-code sync is ENABLED in production (`/api/sync/status` = enabled, ready) as of Oct 28, 2026, about 8:36 PM MT, after Justin set `NEON_DATABASE_URL` in the Render dashboard; live smoke test 11/11 and live checks 19/19 (see QA-REPORT-hail-mary.md).**

Three things from Justin: big-play Gamecast animations, accounts that survive clearing the browser (recovery code on Neon Postgres), and a Rankings tab/data mismatch he reported from his iPhone. Not yet deployed.

### Added
- **Big-play Gamecast animations (every sport with play data).** A detection layer (`server/bigplay.js`) tags each play with a tier (`big` / `huge`) and a headline; the open Gamecast pops a callout card over the game with a short transform/opacity animation (about 2.6 s), animates the score, and flags the play in the list with a `★ HEADLINE` badge. No audio. With "reduce motion" on, a static card shows for about 3.6 s instead. Only plays that arrive while you are watching a live game animate; opening a game, or returning after more than 25 s away, only records what you have already seen. A play id never animates twice, and only the best new play per poll animates. Finished games get a "Big plays" chips card.
  - Football: big = TD, 2-pt conversion, pass/run of 20-39 yd, interception, lost fumble, FG 50-59. Huge = TD of 40+ or any return TD, pass/run of 40+ yd ("BOMB!" / "BREAKAWAY!"), INT returned 40+, sack-fumble lost to the defense, safety, FG 60+.
  - Baseball: big = HR, triple, hit driving in 3+, go-ahead or tying hit from the 7th. Huge = grand slam, walk-off, go-ahead or tying HR from the 7th.
  - Basketball: big = made 3, dunk, and-one, buzzer-beater (1.0 s or less), go-ahead or tying basket in the last 2:00 of the final period or OT. Huge = 4-point play, game-winning or tying buzzer-beater, go-ahead or tying basket in the last 0:30.
  - Hockey: big = goal (power-play and empty-net labelled). Huge = OT goal, short-handed goal, tying goal in the last 2:00 of the 3rd.
  - Soccer: huge = goal, penalty or own goal. Big = red card, penalty missed or saved.
  - Golf: big = eagle. Huge = albatross or hole-in-one (needs the hole's par; skipped otherwise). Tennis: none (the feed has no point data).
  - Other ESPN sports: any scoring play is a generic big "SCORE!". NCAA.com fallbacks are text-only (no animation).
- **Recovery-code account sync (optional).** Settings › Account: "Back up my settings" creates a 12-character code (`XXXX-XXXX-XXXX`, shown once; you must tick "I saved it" before Done). The same screen restores on another phone or after clearing the browser (replace or merge). No email, no password, no tracking. Synced: favorites (sports, teams, players), mute lists, sources, news switches, theme, "how you watch". Not synced: the onboarding flag, anything transient.
  - The server keeps only an HMAC of the code (`SYNC_PEPPER` is the key), never the code itself, in a Neon Postgres table (idle profiles are purged after 12 months). Payload is allow-listed and capped at 32 KB.
  - Local first: the app works exactly as before with no code. Changes upload 3 s after you stop editing; offline or when the database is down they are kept and retried (online, return to the app, next launch). Two devices that edit at once are merged (lists unioned, for single settings like theme, a value this device changed wins and a value it did not change is taken from the other device).
  - Endpoints (`/api/sync`): `GET /status`, `POST /` (create), `POST /lookup`, `GET|PUT|DELETE /profile` (`Authorization: Sync <code>`; `If-Match` revision). `no-store` everywhere; the service worker never caches them.
  - Abuse limits (in memory, per server instance): 5 creates per hour per IP (+300 per hour overall), 10 lookups per minute per IP, 30 wrong codes per hour pauses code endpoints, 60 writes per minute.
  - **Setup on Render:** set `NEON_DATABASE_URL` (or `DATABASE_URL`) and `SYNC_PEPPER` (any random string of 16+ characters; keep it forever, changing it orphans every code). Optional `SYNC_SCHEMA` (default `public`). Without both, the sync card is hidden and nothing else changes. Tables are created idempotently at start; if the database is unreachable the server still starts and `/api/sync` answers 503 until it recovers.
  - Database access uses Neon's HTTPS driver (`@neondatabase/serverless`), not a raw TCP driver.
- Tests: new `tests/bigplay.test.js` (real ESPN fixtures), `syncdata.test.js`, `sync.test.js`, `sync-neon.test.js` (random throwaway schema, dropped afterward), `sync-client.test.mjs`; browser QA `scripts/qa-v21.sh` (adds BP-*, TM-*, SY-* cases; creates and removes a throwaway Neon schema).

### Fixed
- **Tab/data mismatch on Rankings pages.** On Rankings › NFL › Bracket (and every Top list / Bracket page) the top sport strip highlighted the saved sport (for example CFB) while the page showed another sport (NFL). The strip, accent colour, tab label and browser title now follow the sport actually shown, including deep links, the Back button and reload. A shown sport with no chip highlights nothing. Tapping a chip on a list or bracket page opens the same page for that sport (or that sport's Rankings tab if it has no list).

### Changed
- Service worker `ss-v27`; `?v=27` on changed assets; package version 1.4.0; `trust proxy` is set to 1 so rate limits see the real client IP behind Render.
- `blockOutlets` is included in the backup (beyond the proposal's list) so outlet blocks survive a restore.
- Settings reset now also unlinks the backup on this device (the server copy remains until you turn the backup off).

### Known limits
- Big-play thresholds are heuristics from the ESPN play text; they will occasionally mis-tier a play. Golf eagles need par; tennis has no data; NCAA.com fallbacks do not animate. Busy basketball games can produce many callouts (a settings toggle is a possible follow-up). The play list only has the plays the feed returns.
- A lost recovery code cannot be recovered (by design: no email). No QR or link hand-off between devices, and no "I have a code" step in onboarding; restore lives in Settings. Rate limits are per server instance. The first request after the Neon database sleeps can take a few seconds.

## v1.3.1 "Windmill" (ss-v26) — 2026-10-28

One request from Justin: add pro softball. He wrote "Athletes Ultimate Softball"; the league is the **Athletes Unlimited Softball League (AUSL)** and is still branded that way, so the app calls it "AUSL Pro Softball". Not yet released (awaiting Justin's go-ahead). v1.4.0 stays reserved for the recovery-code account sync.

### Added
- **AUSL Pro Softball** as a sport (group Baseball, kind team; included in the all-sports default and in "Mute every sport I haven't selected"). Six teams with location-first names and logos: Carolina Blaze, Chicago Bandits, Oklahoma City Spark, Portland Cascade, Texas Volts, Utah Talons. Picker entry in its own AUSL group (teams only; no followable players).
- Scores and schedule, **standings (computed)**, team pages (schedule, record, roster, news), game page (result, venue, TV), sports-only news, Top list and **championship bracket** (play-in, then the AUSL Championship Series) in the Bracket Buzzer hub.
- **Honest offseason state:** shows the last 8 real games, the 2026 regular-season table and the 2026 champion (Utah Talons over the Chicago Bandits, 2-0). No next-season date is shown: no verifiable source publishes one. Preseason and mid-season states are unit-tested from the real 2026 game log.
- Data sources (all server-side, cached, with attribution in the app): Wikipedia "2026 AUSL season" game log (CC BY-SA 4.0; results, schedule, postseason; standings are computed from it) and MLB Stats API (sport 576, league 6044; teams, venues, rosters, logos only). theausl.com is link-only. A saved snapshot `data/ausl-2026.json` is served (and flagged) when both sources are down; rebuild it with `node scripts/build-ausl-snapshot.js`.
- Tests: new `tests/ausl.test.mjs`; 13 suites via `npm test`; browser QA `scripts/qa-v20.sh`; report `QA-REPORT-windmill.md`.

### Changed
- Service worker `ss-v26`; `?v=26` on changed assets; package version 1.3.1.
- `server/highlight.js`: AUSL teams are treated as pro teams, so the Utah Talons are not flagged as the Utah Utes.

### Fixed
- AUSL stories that say "softball" were hidden by "mute unselected" when College Softball was not picked. "softball" now counts as an AUSL word (kept when AUSL is picked).

### Known limits
- **No live scores, play-by-play or Gamecast who/what for AUSL:** no free, licensed feed exists (ESPN has none; theausl.com's terms forbid automated copying). Gamecast says so and links to theausl.com.
- MLB Stats API terms say "individual, non-commercial, non-bulk use"; the app uses it only for team names, logos and rosters (cached). Justin should confirm he is comfortable with that.
- Standings are computed from a volunteer-edited Wikipedia log (may lag in season), not the league's official table. The Results record includes playoffs and says so.
- Roster rows are display-only. AUSL stories may also show up in College Softball news.

## v1.3.0 "Pick Six" (ss-v25) — 2026-10-28

Four requests from Justin: a better favorites picker, a "mute everything I didn't pick" switch, a proposal for accounts that survive clearing the browser, and "who did what" on every Gamecast. Not yet released (awaiting Justin's go-ahead).

### Added
- **Favorite-team picker grouped by league** (Settings › Teams): one collapsible group per league (NFL, NCAA football, NBA, MLB, ...), teams sorted alphabetically by **location-first full name** ("Boston Red Sox", "Chicago Cubs", "Utah Jazz"; colleges by school: "BYU Cougars", "Utah Utes"). A/Z or Conference sort, league chips, and the search box still works (groups show "x of y" while searching). New module `public/picker.js`.
- **"Mute every sport I haven't selected"** checkbox on Settings › Mute. Hides news and games from every sport that is not one of your favorite sports, including sports added to the app later; untick to bring them back. While no favorites are picked (the v1.1.0 show-everything default) the box is disabled with "Pick favorite sports first" and nothing is muted. The saved choice is kept in `muteUnselected`; it is applied at read time and never copied into your own mute list, so unticking restores exactly the previous mutes. Settings schema v6 (migration keeps existing data).
- **Who and what on every Gamecast** (all 24 sports): each play gets a plain-English description plus the people involved with their roles (passer, receiver, tackler, shooter, assist, pitcher, batter, ...), shown in the "last play" banner, the play list and the animated graphic caption. Names and headshots come only from ESPN play payloads (NCAA.com play-by-play where ESPN has none); when a name cannot be resolved the raw ESPN play text is shown. New: `server/playwho.js`, `server/ncaa-pbp.js`, `public/whoplay.js`.
- **Account-sync design proposal** (`PROPOSAL-account-sync.md`, with 390px mockups in `docs/mocks/`). Proposal only: nothing is built. Recommendation: recovery code on Neon Free ($0/month).
- Tests: 12 suites via `npm test` (new: picker, mute-unselected, playwho, whoplay); browser QA via `scripts/qa-v19.sh`; report `QA-REPORT-pick-six.md`.

### Changed
- Service worker `ss-v25`; `?v=25` on changed assets; package version 1.3.0.

### Fixed
- **Settings switches and checkboxes did not toggle** (found by QA): the Settings page click handler returned `false`, which cancels the click on a checkbox. Pre-existing since the first commit; fixed in `bindPrefs` (`public/app.js`). This is also why the new mute checkbox works. Not verified on the live site (it returned 503 when checked).
- Soccer, hockey, NBA, golf and college-baseball play wording edge cases found during per-sport fixture testing.

## v1.2.0 "Bracket Buzzer" (ss-v24) — 2026-10-27

Every sport now has a Top list and a bracket / championship view. **Released and live** (deploy `dep-dbgi6fu1egvs73b0ebq0`).

### Added
- **Rankings & Brackets hub** (`#/rankings/lists`) with a page per sport: `#/rankings/list/<sport>` (Top list) and `#/rankings/playoffs/<sport>` (bracket or championship view). Sports: NFL, NBA, WNBA, NCAA men's and women's basketball, MLB, college baseball, college softball, college gymnastics. CFB keeps its existing JT Top 25 and Bracket (linked from the hub). Promo cards on Home and Rankings.
- **JT Power Rankings** for NFL, NBA, WNBA and MLB, computed from ESPN standings (record, point/run differential and last-10 form, each shrunk toward average for small samples). Formula shown in-app. Daily snapshots under `data/lists/<sport>/` drive ▲/▼ movement.
- **Real brackets:** NFL (14 teams), MLB (12 teams, live World Series card with series score and next game), NBA (play-in + 16), WNBA; NCAA men's and women's tournaments and the college baseball postseason from NCAA.com; college softball; college gymnastics shows the championship result, history and how the format works (no bracket exists).
- **NCAA.com** (via `ncaa-api.henrygd.me`) wherever ESPN has gaps; Road to Nationals for gymnastics rankings.
- **Honest states:** preseason, early season, offseason, final, not-available-yet, loading, error with Try again, 25 s timeout. Nothing is invented when data is thin.
- JT drop-in lists: put `data/jt-lists/<sport>/latest.json` in place and that sport's list switches from the official poll to the JT list.
- Utah, BYU and Big 12 highlighting on every list and bracket (display only).
- Env switches: `LISTS_DATA_DIR`, `LISTS_NO_WRITE`, `JT_LISTS_DIR`, `NCAA_API_BASE`, `RTN_API_BASE`.
- Tests: 8 suites via `npm test`; browser QA via `scripts/qa-v18.sh`; report `QA-REPORT-bracket-buzzer.md`.

### Changed
- Service worker `ss-v24` (installs each shell file independently); `?v=24` on changed assets; package version 1.2.0.

### Fixed during QA (before release)
- Pro teams that share a place name with a Big 12 school (Bengals/Cincinnati, Texans/Houston, Cardinals/Arizona, Jazz/Utah) were wrongly tagged Big 12 / Utah; pro franchises are now never tagged.
- NFL/MLB seeding could include teams without a seed.

## v1.1.0 "Two-Minute Drill" (ss-v23) — 2026-10-25

Fast, focused fixes for two things Justin reported right after the bracket launch.

### Fixed
- **Bracket button showed nothing.** Root cause: the ss-v22 server update dropped the old `bracket` field from `/api/grok-top25`; a copy of the app already open on a phone (iOS keeps old JS in memory) still read it and showed "No bracket for this week". The API now includes a compatible `bracket` for old app versions, and the app updates itself promptly (checks for a new version on open and when returning to the app; reloads once when a new service worker takes over).
- **Bracket page is never blank.** Shows a loading line, then content — or an error with a "Try again" button (also after a 25-second timeout, for server cold starts).
- **No sports selected ⇒ everything.** A profile that never picked sports now shows every sport (NCAA football, NFL, MLB, golf, tennis, NBA, WNBA, NHL, MLS/soccer leagues, college basketball, UFC, F1, …) in the Scores, News and Schedule sport chips instead of only NCAA football. Old installs that only had the former default (`['cfb']`) are migrated to this. People who chose their sports keep them exactly.

### Added
- Settings → Sports: "Showing every sport until you pick some" hint, and a **Show all sports** button once you have picked.
- QA harness: `scripts/qa-v17.sh` + `QA-REPORT-two-minute-drill.md`.

### Changed
- Service worker `ss-v23`: shell files are cached individually so one failing file can't block an update. `?v=23` on all changed assets.
- Settings schema v5 (`sportsChosen`); localStorage key unchanged (`straightcfb.settings.v1`).

## v1.0.0 "Playoff Push" (ss-v22) — retro-named
Playoff Bracket page: My Bracket (JT), AP Projected, Official CFP (shows "not released yet" until the committee's first ranking).
