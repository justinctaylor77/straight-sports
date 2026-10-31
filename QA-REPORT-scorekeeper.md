# QA report — v1.7.0 "Scorekeeper" (ss-v31)

**Local only: not pushed, not deployed.** Run 2026-10-31 (America/Denver) with `scripts/qa-v25.sh` at 390×844. Results: `docs/qa-results-v25.json`. Screenshots: `screenshots/v25/` (git-ignored).

## Summary
### Round 2: pencil-on-paper redesign (Justin: "mimics the hand writing … off white sheet … old school sheets with pencil marks")
- **Full rerun after the redesign: 240 cases, 239 PASS / 1 FAIL.** It ran in the background with `scripts/qa-v25.sh` on 2026-10-31 (America/Denver).
  - The 1 failure is **HS-09** (High School football, KSL list). It fails because KSL's YouTube RSS feed returned HTTP 404/500 from YouTube during the run and during an HS-only rerun (16/17). The page failed soft and showed the honest empty state with no errors. I didn't touch any HS football code this round. Details are in the case's `note` field in `docs/qa-results-v25.json`.
- All 12 Scorekeeper cases pass: U-SC plus SC-01 to SC-11, including the new SC-11 "pencil-on-paper look" case. `npm test` is green: `scorecard.test.js` has 59 assertions and the new `scorecard-render.test.mjs` has 12 (identical marks for the same play, rotation within ±2°, offset within ±1px, stroke width 1.6–2.2px, hatched run diamond, pencil RBI dots, printed NO./PLAYERS/POS).
- Updated checks: SC-03 reads the printed paper header (TEAM … / NO. PLAYERS POS); SC-04 counts the pencil RBI dots and takes the close-up `sc-04b-closeup.png`. Every functional check from round 1 is still there.

### Round 1 (first build)

- **239 cases: 239 PASS / 0 FAIL** after reruns. Full run: 231 PASS / 8 FAIL.
  - 7 failures were older checks that still expected the previous version strings (`?v=30` / `ss-v30`): S-01, S-03, BP-S2, BP-SW, SY-11, LC-02, HS-01. I updated those checks to `?v=31` / `ss-v31`, and all 7 pass in filtered reruns (SY-11 was rerun as part of the whole SY block).
  - GC-L-f1 failed because ESPN's feed had no F1 race live or final at that moment. It passed on rerun.
- All 11 new scorecard cases pass (U-SC plus SC-01 to SC-10), and `tests/scorecard.test.js` has 59 assertions.

## New cases (Scorekeeper)
| ID | What | Result |
|---|---|---|
| U-SC | Parser unit tests over 2 real ESPN MLB finals (one with 12 innings) and synthetic SF/IBB/TP/unreadable text | PASS |
| SC-01 | Baseball Gamecast shows the Scorecard link to `#/scorecard/mlb/<id>` | PASS |
| SC-02 | No link on NFL, NBA, NHL, EPL, or CFB games, or on AUSL softball | PASS |
| SC-03 | Final sheet: 9 innings, R/H/E/LOB, AB R H RBI BB K, pitcher lines, FINAL badge, Away/Home toggle | PASS |
| SC-04 | Diamonds and shorthand match the plays: HR with 2 RBI dots and a filled diamond, E-6, called-K (backwards) with out 3 and slash, swinging K, 1B with SB note | PASS |
| SC-05 | Live: LIVE badge, current batter highlighted in the 5th, sheet updates on the 10s poll and the highlight moves to the 6th without a reload | PASS |
| SC-06 | Text contrast ≥ 4.5:1 in light and dark app themes (pencil on paper: min 6.11) | PASS |
| SC-07 | At 390px the page doesn't scroll sideways, the grid does, and the batter column stays sticky | PASS |
| SC-08 | Pre-game: "Scorecard fills in once the game starts.", lineup only, no LIVE badge | PASS |
| SC-09 | Leaving the sheet: a slow old response doesn't repaint, and the live poll stops | PASS |
| SC-10 | `/api/scorecard` serves the real MLB game; NFL gets 400 | PASS |
| SC-11 | Pencil-on-paper: paper rgb(246,241,227) in both light and dark app themes (and on the sticky player column); Caveat loaded from /fonts (0 external font requests); every handwritten element ≥14px in graphite #4a4a4a; scored diamond is hatched (8% tint, not solid); 67 marks rotated within ±2°; no navy boxes inside the paper; live: marks identical after a 10s poll, current cell has a yellow highlighter ::before and no colored border | PASS |

The full regression list (U-, GC-, AU-, S-, BP-, SY-, LC-, HS-, R-, P-) is in `docs/qa-results-v25.json`. Each case there has its steps, expected result, and actual result.

## Known limitations
- **Look:** The 1B/2B/3B/HR/BB hints next to each box were left out, because at 390px they crowded the out circle and the notes. The printed ball/strike boxes stay empty because ESPN's play text doesn't give the pitch count for each at-bat. The pencil look is all SVG and CSS (jittered paths, hatching, a noise grain). The only added asset is the Caveat font: one ~50 KB woff2, cached by the service worker.
- **Live auto-scroll:** a live sheet scrolls so the inning before the current one shows next to the batter column.
- Shorthand comes from ESPN's play sentences. If ESPN words a play in a way the parser doesn't know, that cell shows "?" instead of a guess. Both recorded games parse with no "?".
- Fielding numbers come from the position named in the sentence ("grounded out to shortstop" becomes 6-3). ESPN doesn't always name the fielder who made the putout, so some outs are simplified (for example, DP 4-3 for a liner turned into a double play).
- Errors in the footer use ESPN's per-inning linescore. LOB is counted from the runners still on base when the half ends.
- Pitch counts and pitcher lines come from ESPN's box score. Mid-game they are as current as ESPN's box score.
- College baseball only fills in when ESPN has play-by-play for the game. The NCAA.com fallback Gamecast uses doesn't have the detail a scorebook needs, so those games show the lineup and a plain note.
- The live QA case uses the real final game cut off mid-game. That means its header score and season totals come from the finished game, but the cells, highlight, and polling are what's being tested.
