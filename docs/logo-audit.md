# Logo contrast audit

Generated 2026-10-29T04:14:48.893Z against http://localhost:8811. Rule: a logo passes on a surface when at least 50% of its silhouette-edge pixels are visible at **3:1** against that surface — the edge pixel itself, or a logo pixel within 2px of it at 48px scale (so a thin white keyline outside a strong outline isn't counted as invisible) (WCAG 2.x SC 1.4.11, non-text contrast). Failing logos get a 1px outline in the opposite tone (light on dark surfaces, dark on light); "after" re-scores the outline ring.

| League | Logos | Pass in every theme | Fixed (outline in ≥1 theme) | Fail dark | Fail light | Fail team-dark | Still under 3:1 after fix | Unmeasured |
|---|---|---|---|---|---|---|---|---|
| cfb | 138 | 134 | 4 | 2 | 1 | 3 | 0 | 0 |
| nfl | 32 | 32 | 0 | 0 | 0 | 0 | 0 | 0 |
| mlb | 30 | 29 | 1 | 0 | 1 | 0 | 0 | 0 |
| nba | 30 | 28 | 2 | 0 | 1 | 1 | 0 | 0 |
| wnba | 15 | 15 | 0 | 0 | 0 | 0 | 0 | 0 |
| mcbb | 366 | 340 | 26 | 11 | 9 | 17 | 0 | 0 |
| wcbb | 364 | 338 | 26 | 11 | 9 | 17 | 0 | 0 |
| nhl | 32 | 32 | 0 | 0 | 0 | 0 | 0 | 0 |
| mls | 30 | 27 | 3 | 0 | 1 | 2 | 0 | 0 |
| nwsl | 16 | 15 | 1 | 1 | 0 | 1 | 0 | 0 |
| epl | 20 | 18 | 1 | 0 | 0 | 1 | 0 | 1 |
| laliga | 20 | 18 | 2 | 0 | 2 | 0 | 0 | 0 |
| bund | 18 | 15 | 3 | 1 | 1 | 2 | 0 | 0 |
| seriea | 20 | 18 | 2 | 1 | 0 | 2 | 0 | 0 |
| ligue1 | 18 | 14 | 3 | 1 | 2 | 1 | 0 | 1 |
| ucl | 36 | 32 | 3 | 1 | 2 | 1 | 0 | 1 |
| ligamx | 18 | 16 | 2 | 1 | 1 | 1 | 0 | 0 |
| cbase | 403 | 373 | 30 | 14 | 9 | 21 | 0 | 0 |
| ausl | 6 | 6 | 0 | 0 | 0 | 0 | 0 | 0 |
| **Total** | **1612** | **1500** | **109** | 44 | 39 | 70 | **0** | 3 |

Unmeasured = the logo host sent no CORS header or the image failed to load (left untouched in the app).
