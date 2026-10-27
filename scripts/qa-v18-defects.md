## Defects found during QA and what was done (honest log)

**Product defects (real bugs, all fixed before the final run):**
1. *Pro teams tagged as Big 12 / Utah.* QA case N-05 showed the Bengals (Cincinnati), Texans (Houston) and Cardinals (Arizona) carrying a "Big 12" tag because the highlighter matched on city name; the Jazz (Utah) would have been tagged as the Utes. **Fixed** in `server/highlight.js` (pro franchise ids `nfl:/nba:/wnba:/mlb:` are never tagged) with a regression assertion in `tests/ncaa.test.js`.
2. *Playoff seeders accepted teams with no seed* (`null <= 7` is true in JavaScript), which could put an unseeded team into the NFL/MLB field. Found by `tests/postseason.test.js`. **Fixed** (`r.seed >= 1 && r.seed <= N`).
3. *Gymnastics history rows showed "over -- · --"* for the cancelled 2020 championship. **Fixed** in `server/feeds.js` (blank runner-up/score are dropped).
4. *UI polish found while reviewing screenshots:* a duplicate record on computed list rows, a misleading "First snapshot saved today" note, and the active sport chip being cut off in the picker. **Fixed** in `public/lists.js`.

**Test-script defects (the product was right, my test was wrong):**
- Run 1 (81/89): A-L-mcbb and A-L-wcbb required `team.name` but poll teams carry `team.short`; B-02, B-04, B-05, E-04 and N-05 matched text case-sensitively although the UI upper-cases headings (CSS `text-transform`); S-02 went offline before the service worker controlled the page (a first visit has nothing cached by design), so it now reloads once online first. 
- Unit-test authoring fixes during development: wrong hand-computed NBA expectation, a path test that looped on `/proc`, a fixture that produced negative wins at 0-0, a stub missing gymnastics, a render-test team object missing `sport`.
- Run 2 (88/89): only B-05 remained, again a case-sensitive text match (the content was correct); fixed.
- Final run: **{{PASS}}/{{TOTAL}} pass** on the committed code.

**Not tested / limits:** real iOS Safari (Chromium mobile emulation only); behaviour after Render's free-plan cold start on the new endpoints; the live site (nothing deployed). NCAA.com proxy availability on the day of release is outside our control.
