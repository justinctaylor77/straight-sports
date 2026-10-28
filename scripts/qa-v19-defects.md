## Defects found during QA and what was done (honest log)

**Product defects (real bugs, all fixed before the final run):**
1. *Settings switches and checkboxes did not toggle.* The first browser QA run failed 8 mute cases because tapping a checkbox on a Settings page did nothing. Cause: `bindPrefs` set `root.onclick = (e) => prefClick(e, root)` and `prefClick` returns `false` when nothing matches; an `onclick` property handler that returns `false` cancels the click, so the browser never toggled the checkbox. Pre-existing since the first commit (reproduced on the v1.2.0 code); not verified on the live site (503 when checked). **Fixed** in `public/app.js` and covered by R-24 (Sources switch toggles).
2. *Soccer shot captions threw* (undefined variable in `shotCap`), found by the per-sport fixtures. **Fixed.**
3. *Duplicate function name* `teamRow` (the new picker row clashed with the existing one). **Renamed** `pickRow`.
4. *Play wording:* football penalty text, hockey roles and NBA blocked shots, college-baseball name cleaning, golf leaders, a 14-day look-back for daily sports, and https-only headshots (an `http://` headshot URL would be blocked as mixed content). **Fixed**, each with a fixture or a case (GC-03).
5. *UI polish found from screenshots:* the long mute explanation was truncated with an ellipsis at 390px (now wraps); mock wording/truncation.
6. *Unverified claim removed* from the proposal (a Turso point-in-time-recovery statement that I could not confirm in official docs).

**Test-script defects (the product was right, my test was wrong):** first full run 96/108. Besides the bug above: the news mock lacked the `status` array the client reads; AS-03 regexes were case-sensitive (CSS upper-cases headings); GC-03 waited for a *visible* element instead of an attached one; S-03 could not intercept the service-worker script fetch with `page.route` (replaced by a small proxy); R-18's length threshold; P-01's text check; MU-06's news check ran with "This sport only" on, which legitimately hid non-football stories (now off, to isolate the mute behaviour).

**Not tested / limits:** real iOS Safari; Render free-plan cold start; the live site (nothing deployed); college basketball and the NCAA.com play-by-play fallback against live data (off-season / no game today); account sync (proposal only). Final run: **{{PASS}}/{{TOTAL}} pass** on the committed code.
