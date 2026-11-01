# QA Report — v1.7.1 "Scorekeeper, every league" (ss-v32, ?v=32)

LOCAL ONLY: not pushed, not deployed. Live remains v1.7.0 (ss-v31). Results: `docs/qa-results-v26.json`.

## Summary
| Run | Result |
|---|---|
| Full run `scripts/qa-v26.sh` (2026-10-31) | 245 PASS / 2 FAIL of 247 (HS-09, SC-L-softball-x) |
| Rerun `QA_ONLY='^(SC-L-softball-x\|SC-.*\|HS-09\|LG-.*)$'` after the CORS fix | 17 PASS / 1 FAIL of 18 (HS-09) — no LG-* cases exist in qa-v26.js |
| Merged (full run + rerun) | **246 PASS / 1 FAIL of 247** |
| `npm test` | all suites pass (incl. scorecard-render, tests/scorecard-leagues.test.js) |

### Failures
- **HS-09 (environmental, known — same as v1.7.0):** the KSL YouTube list is empty because the server reports `youtubeKey:false`; no console errors and the empty state renders. This is about the environment, not a code bug.
- **SC-L-softball-x (fixed):** the sheet rendered correctly (9 innings, 0 `?` cells). The test failed only because of 3 console CORS errors. NCAA.com school logos are rendered as `<img crossorigin="anonymous">` (for the v1.5.0 logo-contrast pixel sampling), and ncaa.com sends no CORS headers. **Fix:** a same-origin `/api/ncaa-logo?p=` proxy in `server/index.js` (allowlisted to `/sites/default/files/images/logos/schools/*`, cached in memory, sends `Access-Control-Allow-Origin`), used by `server/ncaa.js`. NCAA.com's CDN returns 503 for the sport-suffixed variants (`*-wsb.70.png`), so the proxy falls back to the plain school logo (checked: 200, 2951-byte PNG), then to a transparent 1×1. Rerun: PASS, no console errors, logos display.

## Per-league coverage (from server/scorecard-route.js + SC-L-* results)
| League | Data source | Sheet fills in | Innings | Evidence |
|---|---|---|---|---|
| MLB | ESPN summary (play-by-play + box) | Live (full play-by-play) | 9 | SC-L-mlb: 37 cells, 0 `?` |
| College baseball | ESPN summary; falls back to NCAA.com play-by-play + box when ESPN has no plays | Live; lineup-only (box lineups, blank cells) when neither source has plays | 9 | SC-L-cbase: 41 cells, 0 `?` |
| College softball | NCAA.com play-by-play + box (`n<contestId>`) | Live; ITB runner and extra innings handled | 7 (+extras) | SC-L-softball 34 cells; SC-L-softball-x 9 inn, 36 cells, 0 `?` |
| AUSL Pro Softball | AUSL game log (Wikipedia): teams + score only | None: blank sheet plus the note "Play-by-play isn't available for this league…" | 7 (+extras) | SC-L-ausl: 8 inn, 0 cells |

## Known limitations
- AUSL has no play-by-play or lineup source, so the sheet stays blank (nothing is invented).
- College baseball: ESPN often has no plays. The NCAA.com fallback relies on matching games by date and team name, and it can miss a game. The sheet is then lineup-only.
- Softball ids have to be NCAA.com ids (`n…`). An ESPN softball id returns 400.
- If a play's text can't be parsed, the cell shows `?` (0 seen in QA).
- NCAA logos rely on the proxy. If NCAA.com is down, a transparent placeholder shows instead.
- HS-09 needs a real YouTube key in the QA environment.

## Screenshots (screenshots/v26/, git-ignored)
sc-l-softball-7inn.png, sc-l-softball-extras-dark.png, sc-l-softball-list.png, sc-l-mlb.png, sc-l-cbase.png, sc-l-ausl.png
