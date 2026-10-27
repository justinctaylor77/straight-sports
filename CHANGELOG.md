# Changelog

Releases get a vintage-sports nickname plus a version label (service-worker cache version in parentheses).

## v1.2.0 "Bracket Buzzer" (ss-v24) — 2026-10-27

Every sport now has a Top list and a bracket / championship view. Not yet released (awaiting Justin's go-ahead).

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
