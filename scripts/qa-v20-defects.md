## Defects found during QA and what was done (honest log)

**Product defects (real bugs, all fixed before the final run):**
1. *Source gaps, not a code bug:* ESPN has no AUSL feed, and theausl.com's terms (updated Aug 12, 2025) forbid automated copying. Built a separate provider on public data (Wikipedia game log, MLB Stats API for teams/rosters/logos) and link out to theausl.com.
2. *Utah Talons was flagged as the Utah Utes* by the college-team highlight matcher. Fixed in `server/highlight.js` (`PRO_ID` now includes AUSL).
3. *Raw ISO date* ("2026-07-25T...") shown on bracket matchups. Now a short Denver-time date.
4. *Players toggle shown for AUSL in the picker* although AUSL has no followable players. Hidden; AUSL forces Teams mode.
5. *Results record 18–9 includes the postseason* but looked like the regular-season record. Labelled "incl. playoffs".
6. *Both sources down* gave no notice when serving the saved copy. Added a saved-copy sentence.
7. *AUSL headlines containing "softball" were hidden by "Mute every sport I haven't selected"* because College Softball was unselected. Found by QA (AU-51/52). Fixed: the word "softball" now belongs to AUSL's mute vocabulary, so it is kept when AUSL is picked. Stories that say only "softball" and mention neither league remain subject to the mute rule.
8. Old tests that assumed nine Bracket Buzzer sports were updated to ten.

**Test-script defects (the product was right, my test was wrong):** first full run 133/139. AU-02, AU-04, AU-70, AU-71 had wrong selectors/expectations; AU-51/52 used the default `sportOnly:true` ("not NFL" hides other-sport stories) so they were not testing the mute switch (defect 7 was found right behind that). The unit test for `MUTE_WORDS.ausl` was updated for the added word, with a new keep-word assertion.

**Process note:** during the final-run window I briefly ran `git stash` by mistake and restored it immediately (`git stash pop`); nothing was lost, and the QA run that overlapped it was discarded and re-run from scratch.

**Not tested / limits:** real iOS Safari; Render free-plan cold start; the live site (nothing deployed); in-season AUSL behaviour against live data (the league is in the offseason; in-season states are fixture-tested only, from the real 2026 game log); account sync (not built). AUSL has no live scores or play-by-play in any legal free source. Final run: **{{PASS}}/{{TOTAL}} pass** on the committed code.
