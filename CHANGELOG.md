# Changelog

Releases get a vintage-sports nickname plus a version label (service-worker cache version in parentheses).

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
