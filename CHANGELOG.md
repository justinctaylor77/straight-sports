# Changelog

Releases get a vintage-sports nickname plus a version label (service-worker cache version in parentheses).

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
