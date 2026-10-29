// High School Football views (v1.6.0 "Single Wing"). Data from /api/hsfb (server/hsfb.js). No scores anywhere: every game
// says "Score not available". Utah (UHSAA) is links only — nothing is scraped from uhsaa.org.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ext = (url, label, sub = '') => `<a class="hs-link" href="${esc(url)}" target="_blank" rel="noopener"><span><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="go" aria-hidden="true">↗</span></a>`;

export const UHSAA = {
  scores: 'https://uhsaa.org/scores/?sid=1&sport=Football&season=Fall',
  rpi: 'https://uhsaa.org/football-rpi/',
  brackets: 'https://uhsaa.org/uhsaa-football/#tournaments',
};
// 2026 state-tournament brackets, as linked from UHSAA's football page (hosted on MaxPreps). Update each season.
export const BRACKETS_2026 = [
  ['6A', 'https://www.maxpreps.com/tournament/LmiJSNRT4U6XQ_MeG9B94Q/RpDN_I4AAEW5LKhVzfIAdA/football-26/2026-%e2%80%a2-uhsaa-football-state-championships-6a-football-championship.htm'],
  ['5A', 'https://www.maxpreps.com/tournament/LmiJSNRT4U6XQ_MeG9B94Q/AcVw-wtj10G63uyaXmHBdg/football-26/2026-%e2%80%a2-uhsaa-football-state-championships-5a-football-championship.htm'],
  ['4A', 'https://www.maxpreps.com/tournament/LmiJSNRT4U6XQ_MeG9B94Q/pdTpXUzxr0O2VlM1ASj-dw/football-26/2026-%e2%80%a2-uhsaa-football-state-championships-4a-football-championship.htm'],
  ['3A', 'https://www.maxpreps.com/tournament/LmiJSNRT4U6XQ_MeG9B94Q/cxqeGOMClUKhq-rSz8_Y5Q/football-26/2026-%e2%80%a2-uhsaa-football-state-championships-3a-football-championship.htm'],
  ['2A', 'https://www.maxpreps.com/tournament/LmiJSNRT4U6XQ_MeG9B94Q/biLrbRt-x0G9CoDZ6awL4g/football-26/2026-%e2%80%a2-uhsaa-football-state-championships-2a-football-championship.htm'],
  ['1A', 'https://www.maxpreps.com/tournament/LmiJSNRT4U6XQ_MeG9B94Q/zCR2sZyECUqZHegKYDBOtQ/football-26/2026-%e2%80%a2-uhsaa-football-state-championships-1a-football-championship.htm'],
  ['8-player', 'https://www.maxpreps.com/tournament/LmiJSNRT4U6XQ_MeG9B94Q/FcPsnZxw4UiAqCQNNA3aNg/football-26/2026-%e2%80%a2-uhsaa-football-state-championships-8-player-football-championship.htm'],
];
export const FIND_MORE = [
  ['https://www.maxpreps.com/football/rankings/1/', 'MaxPreps national rankings', 'maxpreps.com'],
  ['https://www.maxpreps.com/ut/football/rankings/1/', 'MaxPreps Utah rankings', 'maxpreps.com'],
  ['https://www.maxpreps.com/ut/football/scores/', 'MaxPreps Utah scores', 'maxpreps.com'],
  ['https://www.espn.com/college-sports/football/recruiting/playerrankings', 'ESPN 300 recruiting rankings', 'espn.com'],
  ['https://247sports.com/season/2027-football/compositerecruitrankings/', '247Sports Composite recruiting rankings', '247sports.com'],
  ['https://www.on3.com/rivals/rankings/industry-player/football/2027/', 'On3 Industry recruiting rankings', 'on3.com'],
  ['https://www.nfhsnetwork.com/associations/uhsaa', 'NFHS Network: Utah (UHSAA) streams', 'nfhsnetwork.com · subscription'],
];
export const NOT_AVAILABLE = [
  ['National scores and schedules', 'No free feed carries them.'],
  ['Rankings in the app', 'Use the UHSAA RPI and MaxPreps links instead.'],
  ['Recruit and star ratings', 'See ESPN 300, 247Sports or On3.'],
  ['Stats and rosters', 'Not in any free feed.'],
  ['Local TV beyond ESPN and KSL', 'Shown as "TV: not listed".'],
];

const when = (iso, o = {}) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short', ...o }) : 'Time not listed'; };
const STATUS = { live: ['LIVE', 'hs-b live'], upcoming: ['UPCOMING', 'hs-b up'], replay: ['REPLAY', 'hs-b rep'] };

export function tvCard(g) {
  const [lbl, cls] = STATUS[g.status] || ['', ''];
  const teams = g.away && g.home ? `<div class="hs-teams"><span>${esc(g.away)}</span><span class="faint">vs.</span><span>${esc(g.home)}</span></div>` : `<div class="hs-teams"><span>${esc(g.name)}</span></div>`;
  return `<div class="card hs-game" data-hs-tv="${esc(g.id)}">
    <div class="status">${lbl ? `<span class="${cls}">${lbl}</span>` : ''}<span class="hs-when">${esc(when(g.date))}</span></div>
    ${teams}
    <div class="hs-meta"><span>TV: ${esc((g.networks || []).join(', ') || 'not listed')}</span><span class="hs-noscore">Score not available</span></div>
    ${g.watch ? `<a class="btn small hs-watch" href="${esc(g.watch)}" target="_blank" rel="noopener">Watch on ESPN ↗</a>` : ''}</div>`;
}
export function kslCard(v) {
  const badge = v.live === 'live' ? '<span class="hs-b live">LIVE</span>' : v.live === 'upcoming' ? `<span class="hs-b up">UPCOMING</span><span class="hs-when" data-hs-start>Starts ${esc(when(v.start))}</span>` : '';
  return `<a class="card hs-vid" data-hs-ksl="${esc(v.id)}" href="${esc(v.url)}" target="_blank" rel="noopener">
    <div class="status">${badge}${v.live ? '' : `<span class="hs-when">Posted ${esc(when(v.published, { hour: undefined, minute: undefined, timeZoneName: undefined }))}</span>`}</div>
    <div class="hs-title">${esc(v.title)}</div>
    <div class="hs-meta"><span>KSL Sports on YouTube</span><span class="hs-noscore">Score not available</span></div></a>`;
}

export function tvSection(tv, n = 40) {
  let h = '<h2>On TV nationally</h2><p class="faint small hs-note">High school games ESPN lists in its Watch catalog (ESPN networks and ESPN+). Times are shown in your time zone.</p>';
  if (!tv || tv.error) return h + `<div class="card empty" data-hs-tv-empty>ESPN’s listings didn’t load right now. Try again in a few minutes.</div>`;
  const live = tv.games.filter((g) => g.status !== 'replay'); const rep = tv.games.filter((g) => g.status === 'replay');
  h += live.length ? `<div class="grid">${live.slice(0, n).map(tvCard).join('')}</div>` : '<div class="card empty" data-hs-tv-empty>No live or upcoming high school games listed by ESPN right now.</div>';
  if (rep.length) h += `<h3 class="hs-sub">Replays on ESPN</h3><div class="grid">${rep.slice(0, Math.max(3, n - live.length)).map(tvCard).join('')}</div>`;
  return h;
}
export function kslSection(ksl, n = 20) {
  let h = '<h2>Utah games on KSL</h2><p class="faint small hs-note">Recent football game videos from the KSL Sports YouTube channel. Watch on YouTube.</p>';
  if (!ksl || ksl.error) return h + `<div class="card empty" data-hs-ksl-empty>KSL Sports’ video list didn’t load right now. <a href="https://www.youtube.com/channel/UCyIZoJ7Ge36sqkMPV_eKGfg" target="_blank" rel="noopener">Open the channel ↗</a></div>`;
  const vids = [...ksl.videos].sort((a, b) => (a.live === 'live' ? 0 : a.live === 'upcoming' ? 1 : 2) - (b.live === 'live' ? 0 : b.live === 'upcoming' ? 1 : 2));
  h += vids.length ? `<div class="grid">${vids.slice(0, n).map(kslCard).join('')}</div>` : `<div class="card empty" data-hs-ksl-empty>No football game videos among KSL Sports’ latest uploads. <a href="${esc(ksl.channel)}" target="_blank" rel="noopener">Open the channel ↗</a></div>`;
  return h;
}
export function utahCard() {
  return `<h2>Utah (UHSAA)</h2><div class="card hs-links" data-hs-utah>
    ${ext(UHSAA.scores, 'UHSAA football scoreboard', 'uhsaa.org')}
    ${ext(UHSAA.rpi, 'UHSAA RPI rankings', 'uhsaa.org')}
    ${ext(UHSAA.brackets, 'UHSAA state tournament brackets', 'uhsaa.org')}
    <div class="hs-chips"><span class="faint small">2026 brackets (MaxPreps):</span>${BRACKETS_2026.map(([c, u]) => `<a class="chip" href="${esc(u)}" target="_blank" rel="noopener">${esc(c)}</a>`).join('')}</div>
    ${ext('https://kslsports.com/stream/', 'KSL Sports streams', 'kslsports.com')}</div>`;
}
export function findMoreCard() {
  return `<h2>Find more</h2><div class="card hs-links" data-hs-more>${FIND_MORE.map(([u, l, s]) => ext(u, l, s)).join('')}</div>`;
}
export function notAvailableCard() {
  return `<h2>Not available in the app</h2><div class="card hs-na" data-hs-na><ul>${NOT_AVAILABLE.map(([a, b]) => `<li><b>${esc(a)}:</b> <span class="faint">${esc(b)}</span></li>`).join('')}</ul></div>`;
}
