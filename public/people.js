// Schedule pages (#/schedule/<teamId>) and player pages (#/player/<id>): past, live and upcoming games,
// SeatGeek ticket links, season + career stats. Data from /api/schedule/team/:id and /api/player/:id (ESPN public JSON).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tz = () => { try { return new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName').value; } catch { return ''; } };
export const fmtDay = (iso, o = {}) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...o });
const fmtTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const tbd = (ev) => /TBD|TBA/i.test(ev.detail || '') || ev.timeValid === false;

export function ticketLine(t) {
  if (!t || !t.url) return '';
  return `<a class="tix" href="${esc(t.url)}" target="_blank" rel="noopener" data-tix>${t.priced ? `Tickets from <b>$${esc(t.lowest)}</b> on SeatGeek` : esc(t.label || 'Tickets on SeatGeek')} ↗</a>`;
}

// one game in a team's schedule, from that team's point of view
export function schedItem(ev, teamId, sport, ctx) {
  const home = ev.home.team && ev.home.team.id === teamId; const me = home ? ev.home : ev.away; const opp = home ? ev.away : ev.home;
  const ot = opp.team || {};
  const when = `${fmtDay(ev.date)}${tbd(ev) ? ' · Time TBD' : ` · ${fmtTime(ev.date)}`}`;
  const oppHTML = `<span class="opp"><span class="va">${home ? 'vs' : '@'}</span><img src="${esc(ctx.logo(ot))}" alt="" loading="lazy" width="26" height="26" />${opp.rank ? `<span class="faint small">${esc(opp.rank)}</span>` : ''}<a href="#/schedule/${esc(ot.id)}" class="on">${esc(ot.short || ot.name || 'TBD')}</a></span>`;
  if (ev.state === 'post') {
    const res = me.winner ? 'W' : opp.winner ? 'L' : 'T';
    return `<a class="sx-row post" href="#/game/${sport}/${esc(ev.id)}"><span class="d faint small">${esc(fmtDay(ev.date, { weekday: undefined }))}</span>${oppHTML.replace(/<a [^>]*>|<\/a>/g, '')}
      <span class="res ${res}">${res} ${esc(me.score)}–${esc(opp.score)}</span></a>`;
  }
  const live = ev.state === 'in';
  return `<div class="sx-item card ${live ? 'live' : ''}">
    <div class="sx-top"><span class="small ${live ? 'livet' : 'muted'}">${live ? `LIVE · ${esc(ev.short || ev.detail || '')}` : esc(when)}</span>${live ? `<b class="sx-sc">${esc(me.score)}–${esc(opp.score)}</b>` : `<span class="faint small">${home ? 'Home' : 'Away'}</span>`}</div>
    <div class="sx-mid">${oppHTML}<a class="btn small ghost" href="#/game/${sport}/${esc(ev.id)}">${live ? 'Gamecast' : 'Preview'} ›</a></div>
    ${ev.venue ? `<div class="faint small sx-ven">${esc(ev.venue)}</div>` : ''}
    ${ctx.watch(ev, { compact: true })}
    ${ticketLine(ev.tickets)}</div>`;
}

const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
// Today / live first, then what's next, then past results (newest first). limitUp/limitPast cap the long lists (the page offers "show all").
export function scheduleSections(events, teamId, sport, ctx, { limitUp = 0, limitPast = 0 } = {}) {
  const tk = dayKey(Date.now());
  const isToday = (e) => e.state === 'in' || dayKey(e.date) === tk;
  const today = events.filter(isToday);
  let up = events.filter((e) => e.state === 'pre' && !isToday(e));
  let past = events.filter((e) => e.state === 'post' && !isToday(e)).reverse();
  const nUp = up.length; const nPast = past.length;
  if (limitUp) up = up.slice(0, limitUp);
  if (limitPast) past = past.slice(0, limitPast);
  const rec = (() => { const r = { W: 0, L: 0, T: 0 }; for (const e of events.filter((x) => x.state === 'post')) { const me = e.home.team.id === teamId ? e.home : e.away; const op = me === e.home ? e.away : e.home; r[me.winner ? 'W' : op.winner ? 'L' : 'T']++; } return r; })();
  const hasLive = today.some((e) => e.state === 'in');
  const more = (k, shown, n) => (n > shown ? `<button class="btn small ghost more" data-more="${k}">Show all ${n} ›</button>` : '');
  return `${today.length ? `<h2>${hasLive ? '<span class="livet">●</span> Live & today' : 'Today'}</h2><div class="sx-list">${today.map((e) => schedItem(e, teamId, sport, ctx)).join('')}</div>` : ''}
    <h2>Upcoming <span class="count">${nUp} · times in ${esc(tz())}</span></h2>
    <div class="sx-list">${up.map((e) => schedItem(e, teamId, sport, ctx)).join('') || '<div class="card empty">No more games on ESPN’s schedule this season.</div>'}</div>${more('up', up.length, nUp)}
    <h2>Results <span class="count">${nPast || rec.W + rec.L + rec.T ? `${rec.W}–${rec.L}${rec.T ? `–${rec.T}` : ''}` : ''}</span></h2>
    <div class="card panel">${past.map((e) => schedItem(e, teamId, sport, ctx)).join('') || '<div class="empty">No games played yet.</div>'}</div>${more('past', past.length, nPast)}`;
}

export function scheduleView(d, ctx) {
  const t = d.team;
  return `<div class="card team-hero" style="--team:#${esc(t.color || '333')}"><img src="${esc(ctx.logo(t))}" alt="" />
      <div><h1>${esc(t.name)}</h1><div class="muted">${[d.season && `${d.season} schedule`, t.record, t.standing].filter(Boolean).map(esc).join(' · ')}</div></div>
      <div class="actions"><a class="btn" href="#/team/${esc(t.id)}">Team page</a>${ctx.followBtn(t)}</div></div>
    ${scheduleSections(d.events, t.id, d.sport, ctx)}
    <p class="faint small">Schedule, scores and TV from ESPN. Ticket links go to the game’s SeatGeek event page${d.ticketsPriced ? '; prices appear when SeatGeek publishes them' : ''}.</p>`;
}

// ---------- player stats ----------
const tableHTML = (head, rows, { cls = '' } = {}) => `<div class="card scroll-x box-card"><table class="tbl box ${cls}"><thead><tr>${head.map((h, i) => (i ? `<td>${esc(h)}</td>` : `<th>${esc(h)}</th>`)).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
function seasonCards(st) {
  const cats = st.cats.filter((c) => c.rows.some((r) => +r.year === st.year && r.stats.some((v) => v && v !== '0' && v !== '-')));
  if (!cats.length) return `<div class="card empty">No ${st.year} stats from ESPN yet.</div>`;
  return cats.map((c) => { const rows = c.rows.filter((r) => +r.year === st.year); const r = rows[rows.length - 1];
    return `<div class="card ps-cat"><h4>${esc(c.title)} <span class="faint small">${esc(r.team || '')}</span></h4><div class="ps-grid">${c.labels.map((l, i) => `<div title="${esc(c.names[i] || l)}"><b>${esc(r.stats[i] ?? '–')}</b><span>${esc(l)}</span></div>`).join('')}</div></div>`; }).join('');
}
function careerTables(st) {
  return st.cats.filter((c) => c.rows.length).map((c) => `<h3 class="ps-h">${esc(c.title)}</h3>` + tableHTML(['Season', 'Team', ...c.labels],
    [...c.rows.map((r) => `<tr class="${+r.year === st.year ? 'mine' : ''}"><th>${esc(r.season)}</th><td>${esc(r.team)}</td>${c.labels.map((_, i) => `<td>${esc(r.stats[i] ?? '')}</td>`).join('')}</tr>`),
      ...(c.totals ? [`<tr class="tot"><th>Career</th><td></td>${c.labels.map((_, i) => `<td><b>${esc(c.totals[i] ?? '')}</b></td>`).join('')}</tr>`] : [])])).join('');
}
function gameLog(p) {
  const L = p.log; if (!L) return '<div class="card empty">ESPN has no game log for this player this season.</div>';
  return tableHTML(['Date', 'Opp', 'Result', ...L.labels], L.games.map((g) => `<tr data-href="#/game/${esc(p.sport)}/${esc(g.id)}"><th>${esc(new Date(g.date).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }))}</th>
    <td class="opp-c">${esc(g.atVs)} ${g.opp.logo ? `<img src="${esc(g.opp.logo)}" alt="" width="16" height="16" loading="lazy" />` : ''}${esc(g.opp.abbr || '')}</td><td class="res ${esc(g.result)}">${esc(g.result)} ${esc(g.score)}</td>${L.labels.map((_, i) => `<td>${esc(g.stats[i] ?? '')}</td>`).join('')}</tr>`), { cls: 'log' });
}

export function playerHero(p, ctx) {
  const bits = [p.pos, p.jersey, p.team && p.team.name, p.country && p.sport !== 'golf' && p.sport !== 'tennis' ? null : p.country, p.age && `Age ${p.age}`, p.height, p.weight].filter(Boolean);
  return `<div class="card team-hero player-hero" style="--team:#${esc((p.team && p.team.color) || '333')}">${p.headshot ? `<img class="hs" src="${esc(p.headshot)}" alt="" />` : p.flag ? `<img class="flag" src="${esc(p.flag)}" alt="" />` : ''}
    <div><h1>${esc(p.name)}</h1><div class="muted">${bits.map(esc).join(' · ')}</div>${p.college || p.experience ? `<div class="faint small">${[p.experience && `Exp: ${p.experience}`, p.college].filter(Boolean).map(esc).join(' · ')}</div>` : ''}</div>
    <div class="actions">${p.team ? `<a class="btn" href="#/schedule/${esc(p.team.id)}">${esc(p.team.short || p.team.abbr || 'Team')} schedule</a>` : ''}${ctx.followBtn(p)}</div></div>`;
}

export function playerTabs(p) {
  if (p.kind === 'golf') return [['stats', 'Season & career'], ['results', 'Results'], ['schedule', 'Schedule']];
  if (p.kind === 'tennis') return [['results', 'Matches'], ['schedule', 'Upcoming'], ['stats', 'Stats']];
  return [['stats', 'Season & career'], ['log', 'Game log'], ['schedule', 'Schedule']];
}

export function playerBody(p, tab, ctx, teamSched) {
  if (p.kind === 'golf') return golfBody(p, tab, ctx);
  if (p.kind === 'tennis') return tennisBody(p, tab, ctx);
  if (tab === 'log') return `<h2>${esc((p.stats && p.stats.year) || '')} game log <span class="count">${p.log ? p.log.games.length : 0} games</span></h2>${gameLog(p)}`;
  if (tab === 'schedule') {
    if (!p.team) return '<div class="card empty">ESPN doesn’t list a current team for this player, so there’s no schedule to show.</div>';
    if (!teamSched) return '<div class="card"><div class="sk w70"></div><div class="sk w50 sm"></div></div>';
    if (teamSched.error) return `<div class="card empty">Couldn’t load the schedule: ${esc(teamSched.error)}</div>`;
    return `<p class="muted small">${esc(p.name)} plays for the ${esc(p.team.name)} — the team’s schedule:</p>${scheduleSections(teamSched.events, teamSched.team.id, teamSched.sport, ctx, { limitPast: 8 })}`;
  }
  if (!p.stats) return `<div class="card empty">ESPN doesn’t publish season or career stats for this player in its free feed.</div>`;
  return `<h2>${esc(p.stats.year)} season</h2><div class="ps-cats">${seasonCards(p.stats)}</div>
    <h2>Career by season</h2>${careerTables(p.stats)}<p class="faint small">Season-by-season and career totals from ESPN. Hover or long-press a label for its full name.</p>`;
}

function golfBody(p, tab, ctx) {
  if (tab === 'results') {
    const played = p.events.filter((e) => e.played).reverse();
    return `<h2>${esc(p.year)} results <span class="count">${played.length} events</span></h2>` + (played.length ? tableHTML(['Date', 'Tournament', 'Finish', 'To par', 'Rounds'], played.map((e) =>
      `<tr data-href="#/game/golf/${esc(e.id)}"><th>${esc(new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</th><td class="l">${esc(e.name)}</td><td><b>${esc(e.pos || '–')}</b></td><td>${esc(e.score ?? '–')}</td><td>${esc(e.rounds.join(' · ') || '–')}</td></tr>`), { cls: 'golf' })
      : '<div class="card empty">No events played this season.</div>') + '<p class="faint small">Finish, score to par and round scores from ESPN. Team events (e.g. Presidents Cup) have no individual finish.</p>';
  }
  if (tab === 'schedule') {
    return `<h2>Tour schedule <span class="count">${esc(p.league.toUpperCase())}</span></h2><p class="muted small">ESPN doesn’t publish which events a golfer has entered ahead of time, so this is the remaining ${esc(p.league.toUpperCase())} Tour calendar.</p>
      <div class="sx-list">${p.upcoming.map((e) => `<div class="sx-item card ${e.state === 'in' ? 'live' : ''}"><div class="sx-top"><span class="small ${e.state === 'in' ? 'livet' : 'muted'}">${e.state === 'in' ? 'THIS WEEK' : esc(`${fmtDay(e.date, { weekday: undefined })} – ${fmtDay(e.endDate || e.date, { weekday: undefined })}`)}</span></div>
        <div class="sx-mid"><b>${esc(e.name)}</b>${e.state === 'in' ? `<a class="btn small ghost" href="#/game/golf/${esc(e.id)}">Leaderboard ›</a>` : ''}</div>${ticketLine(e.tickets)}</div>`).join('') || '<div class="card empty">No more events on the calendar.</div>'}</div>`;
  }
  const s = p.season;
  return `<h2>${esc(p.year)} season</h2>${s ? tableHTML(['', ...s.labels], s.splits.map((r) => `<tr><th>${esc(r.name)}</th>${r.stats.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`)) : '<div class="card empty">ESPN has no season summary for this golfer.</div>'}
    ${p.rankings.length ? `<h2>Tour rankings</h2><div class="ps-grid card">${p.rankings.map((r) => `<div><b>${esc(r.value)}</b><span>${esc(r.label)}${r.rank ? ` · ${esc(r.rank)}` : ''}</span></div>`).join('')}</div>` : ''}
    <h2>Career</h2><div class="card empty">ESPN doesn’t publish career totals for golfers in its free feed — only this season’s numbers above.</div>`;
}

function tennisBody(p, tab, ctx) {
  const up = p.matches.filter((m) => !m.played); const done = p.matches.filter((m) => m.played);
  if (tab === 'schedule') return `<h2>Upcoming</h2><div class="card panel">${up.map((m) => `<div class="sx-row"><span class="d faint small">${esc(fmtDay(m.date, { weekday: undefined }))}</span><span class="opp">${esc(m.tournament)} · ${esc(m.round || '')} vs ${esc(m.opp)}</span><span class="faint small">${esc(fmtTime(m.date))}</span></div>`).join('') || '<div class="empty">ESPN lists no scheduled matches for this player right now. Tennis draws are only known a round at a time.</div>'}</div>`;
  if (tab === 'stats') return `<h2>${esc(p.year)} season</h2>${p.record ? `<div class="kv"><div class="card"><div class="v">${p.record.w}–${p.record.l}</div><div class="l">Match record (from ESPN results)</div></div><div class="card"><div class="v">${done.filter((m) => m.round === 'Final' && m.win).length}</div><div class="l">Titles</div></div></div>` : ''}
    <div class="card empty">ESPN’s free tennis feed has no per-player stats (aces, serve %, break points) and no career totals — only match results.</div>`;
  return `<h2>${esc(p.year)} matches <span class="count">${p.record ? `${p.record.w}–${p.record.l}` : ''}</span></h2><div class="card panel">${done.map((m) => `<div class="sx-row tn"><span class="d faint small">${esc(new Date(m.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</span>
    <span class="opp"><span><b>${esc(m.tournament)}</b> <span class="faint small">${esc(m.round || '')}</span><br><span class="small">vs ${m.oppId ? `<a href="#/player/${esc(m.oppId)}">${esc(m.opp)}</a>` : esc(m.opp)}${m.oppSeed ? ` (${esc(m.oppSeed)})` : ''}</span> <span class="faint small">${esc((m.result || '').replace(/^.*?\)\s*\([A-Z]{3}\)\s*/, '').replace(/^.*?\bbt\b.*?\([A-Z]{3}\)\s*/, ''))}</span></span></span>
    <span class="res ${m.win ? 'W' : 'L'}">${m.win ? 'W' : 'L'}</span></div>`).join('') || '<div class="empty">No matches this season.</div>'}</div>`;
}
