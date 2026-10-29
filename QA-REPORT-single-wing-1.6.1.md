# QA & Acceptance Report — v1.6.1 "Single Wing" KSL filter fix (ss-v30)

**Status:** QA complete, **not released** — waiting for Justin's go-ahead. Live is v1.6.0 "Single Wing" (ss-v29).
**Result (full run, Oct 29, 2026, ~12:10 PM MT):** **228 PASS / 0 FAIL / 0 SKIP** of 228. Sync test schema removed (remaining=0).

## The defect (found in the v1.6.0 live check)
"Utah games on KSL" listed two KSL talk-show clips as games, e.g. "Sitting at 6-1 ahead of Arizona State match up, when will BYU football lose a game again?", split into fake teams "Sitting" vs. "6-1 ahead of…". Cause: the filter accepted any title with "football" and the word "at".

## The fix (server/hsfb.js `isFootballGame`)
A video counts as a high school game only if its title:
1. says "football" and no other sport;
2. names a high school class (1A–6A) **or** says "high school";
3. starts with two teams joined by "vs.", "at" or "@" (before any " - ", "|" or ":");
4. is not a question or show segment and doesn't mention BYU, Utes, college, NFL, Big 12, podcast or show.
If no game videos are in KSL's latest uploads, the card says so plainly with a link to the channel.

## Tests
| Check | Result |
|---|---|
| Unit: the two live BYU talk titles are rejected | ✅ PASS |
| Unit: "Utah vs. BYU Football Highlights" (college) rejected | ✅ PASS |
| Unit: "Skyridge at Lone Peak - 6A Football" and "Lone Peak vs. Corner Canyon - High School Football" accepted | ✅ PASS |
| Unit: earlier cases (6A game kept, volleyball/show/mailbag rejected) | ✅ PASS (hsfb: 82 assertions) |
| Real KSL feed today: 15 titles (14 girls volleyball, 1 BYU-Utah talk) all correctly dropped | ✅ PASS |
| Full regression suite (HS, NAV, sync, logos, search, big plays, brackets, SW, versions 1.6.1 / ss-v30 / ?v=30) | ✅ 228/228 |

## Caveats
- KSL's feed has no high school football videos right now, so the live card will show the "No football game videos" note until KSL posts one.
- Title-based matching: a real game titled without a class or "high school" would be left out (preferred over showing non-games).

**QA sign-off:** ✅ 228/228. **Business sign-off (Justin):** ⏳ pending.
