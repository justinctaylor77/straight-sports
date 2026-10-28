// Rankings & Brackets for every sport (v1.2.0 "Bracket Buzzer"): JT top lists + championship / playoff views.
// Data comes from /api/lists/:sport and /api/playoffs/:sport (server/feeds.js). Nothing here invents data: every
// number, seed and score is rendered from the payload, and every state (loading, error, offseason, preseason,
// not available) has its own message. Pure render helpers are exported for the tests; createLists() wires the DOM.
export const FEED = ['nfl', 'nba', 'wnba', 'mcbb', 'wcbb', 'mlb', 'cbase', 'softball', 'ausl', 'gymnastics'];
const KIND = { computed: 'Computed by JT formula', poll: 'Official poll', jt: 'JT’s own list', standings: 'Computed standings' };
const STATE = { ready: 'In season', early: 'Early season', final: 'Final', preseason: 'Preseason', offseason: 'Offseason', live: 'Live', projected: 'Projected', complete: 'Complete', announced: 'Announced', none: 'Not yet announced', unavailable: 'Not available' };
const TIMEOUT = 25000;

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const parseHash = (h) => { const m = /^#\/rankings\/(lists|list|playoffs)(?:\/([a-z0-9]+))?/.exec(h || ''); return m ? { page: m[1], sport: m[2] || '' } : null; };
// picker order: current sport first, then the user's chosen sports (only if they picked), then the rest in catalog order
export function pickerOrder(S, feed = FEED) {
  const first = feed.includes(S.sport) ? [S.sport] : [];
  const mine = S.sportsChosen ? S.sports.filter((s) => feed.includes(s)) : [];
  return [...new Set([...first, ...mine, ...feed])];
}
export const moveChip = (m) => (m === 'new' ? '<span class="mv new">NEW</span>' : typeof m === 'number' ? (m > 0 ? `<span class="mv up" aria-label="up ${m}">▲${m}</span>` : m < 0 ? `<span class="mv dn" aria-label="down ${-m}">▼${-m}</span>` : '<span class="mv eq" aria-label="unchanged">=</span>') : '');
const fmtDay = (iso) => { if (!iso) return ''; const d = new Date(String(iso).length === 10 ? `${iso}T12:00:00` : iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };

export function makeRender({ logo = (t) => (t ? t.logo : ''), myTeamIds = () => new Set() } = {}) {
  const hlCls = (t) => `${t && t.hl && t.hl.spot ? 'spot' : ''}`;
  const bigTag = (t) => (t && t.hl && t.hl.big12 ? '<span class="lb-b12" title="Big 12">Big 12</span>' : '');
  const spotTag = (t) => (t && t.hl && t.hl.spot ? `<span class="lb-spot">${t.hl.spot === 'utah' ? 'Utah' : 'BYU'}</span>` : '');
  const mine = (t, sport) => (t && t.id && t.sport === sport && myTeamIds().has(t.id) ? 'mine' : '');
  const linkable = (sport) => ['nfl', 'nba', 'wnba', 'mlb', 'mcbb', 'ausl'].includes(sport);
  const tagsOf = (d) => `<span class="gk-tag live">${esc(STATE[d.state] || d.state)}</span><span class="gk-tag grok">${esc(KIND[d.kind] || d.kind || '')}</span>`;
  const srcLine = (d, extra = '') => `<p class="faint small lb-src">Source: ${d.source && d.source.url ? `<a href="${esc(d.source.url)}" target="_blank" rel="noopener">${esc(d.source.name)}</a>` : esc(d.source ? d.source.name : '')}${d.asOfLabel ? ` · ${esc(d.asOfLabel)}` : d.asOf ? ` · ${esc(fmtDay(d.asOf))}` : ''}${extra}</p>`;
  const notes = (d) => (d.notes || []).map((n) => `<div class="notice lb-note">${esc(n)}</div>`).join('');

  function sub(r, d) {
    if (d.kind === 'computed') return `<span><b>${r.score != null ? Number(r.score).toFixed(1) : '–'}</b> pts</span>`;
    if (d.sport === 'gymnastics') return r.avg != null ? `<span>Avg <b>${Number(r.avg).toFixed(3)}</b></span>${r.high != null ? `<span>High <b>${Number(r.high).toFixed(3)}</b></span>` : ''}` : '';
    if (r.detail) return `<span>${esc(r.detail)}</span>`;
    if (r.points != null) return `<span><b>${r.points}</b> pts${r.fpv ? ` (${r.fpv})` : ''}</span>`;
    return '';
  }
  function row(r, d) {
    const t = r.team || {};
    const tag = linkable(d.sport) && t.id ? 'a' : 'div';
    const href = tag === 'a' ? ` href="#/schedule/${esc(t.id)}"` : '';
    const rec = r.record && !(d.kind === 'computed' && r.why) ? `<span class="rec">${esc(r.record)}</span>` : '';
    return `<${tag} class="gk-row lb-row ${mine(t, d.sport)} ${hlCls(t)}"${href} style="--tc:#${esc(t.color || '888')}"><span class="gk-rank">${esc(r.rank)}</span><img src="${esc(logo(t))}" alt="" loading="lazy" />
      <div class="gk-nm"><b>${esc(t.short || t.name || 'TBD')}</b>${rec}${spotTag(t)}${bigTag(t)}${r.why ? `<div class="gk-why">${esc(r.why)}</div>` : ''}</div>
      <span class="gk-polls">${moveChip(r.move)}${sub(r, d)}</span></${tag}>`;
  }
  function methodCard(d) {
    const m = d.method || {}; const li = (t) => `<li>${esc(t)}</li>`;
    return `<div class="card br-foot lb-method"><h3>How this list is built</h3><p class="gk-method">${esc(m.short || '')}</p>
      ${(m.formula || []).length ? `<ul class="gk-how-list">${m.formula.map(li).join('')}</ul>` : ''}
      ${(m.caveats || []).length ? `<h3>Caveats</h3><ul class="gk-how-list">${m.caveats.map(li).join('')}</ul>` : ''}
      ${(d.links || []).length ? `<p class="faint small">More: ${d.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a>`).join(' · ')}</p>` : ''}</div>`;
  }
  function listBody(d, pollId) {
    const polls = d.polls || [];
    const poll = polls.find((p) => p.id === pollId) || polls[0];
    const rows = (poll && poll.rows) || d.rows || [];
    const snap = d.snapshot
      ? (d.snapshot.first ? 'No earlier snapshot to compare with yet, so there is no movement. It appears once the list has been saved on an earlier day.' : `Movement compares with the ${fmtDay(d.snapshot.prevDate)} snapshot.`)
      : '';
    const asOf = poll && poll.date ? `${poll.headline || poll.name} · ${fmtDay(poll.date)}` : d.asOfLabel;
    return `<div class="card gk-hero lb-hero"><div class="gk-kicker">${esc(d.name)}</div><div class="gk-title">${esc(d.title)}</div>
      <div class="gk-method">${esc(d.label || '')}</div><div class="gk-src">${tagsOf(d)}</div>
      ${srcLine({ ...d, asOfLabel: asOf })}${snap ? `<p class="faint small">${esc(snap)}</p>` : ''}</div>
      ${notes(d)}
      ${polls.length > 1 ? `<div class="gk-sub"><div class="seg" role="tablist">${polls.map((p) => `<button role="tab" data-lbpoll="${esc(p.id)}" aria-selected="${p === poll}" class="${p === poll ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div></div>` : ''}
      ${rows.length ? `<div class="card gk-list lb-list">${rows.map((r) => row(r, d)).join('')}</div>` : '<div class="card empty">This list has no rows right now.</div>'}
      ${methodCard(d)}`;
  }

  // ----- brackets -----
  const dayOf = (m) => [m.date, m.time].filter(Boolean).join(' ');
  function slot(s, m) {
    if (!s || !s.team) return `<div class="bt tbd"><span class="sd">${s && s.seed != null ? esc(s.seed) : ''}</span><span class="n"><b>${esc((s && s.label) || 'TBD')}</b></span></div>`;
    const t = s.team; const val = s.score != null ? s.score : s.wins != null && m.bestOf > 1 ? s.wins : null;
    return `<div class="bt ${s.winner ? 'win' : m.status === 'final' ? 'lose' : ''} ${hlCls(t)} ${mine(t, m._sport)}" style="--tc:#${esc(t.color || '888')}"><span class="sd">${s.seed != null ? esc(s.seed) : ''}</span><img src="${esc(logo(t))}" alt="" loading="lazy" />
      <span class="n"><b>${esc(t.short || t.name)}</b><small>${t.hl && t.hl.spot ? esc(t.hl.spot === 'utah' ? 'Utah' : 'BYU') : t.hl && t.hl.big12 ? 'Big 12' : esc(t.abbr || '')}</small></span>${val != null ? `<span class="lb-sc">${esc(val)}</span>` : ''}</div>`;
  }
  function matchup(m) {
    const head = m.summary || (m.status === 'projected' ? 'Projected' : dayOf(m));
    const bo = m.bestOf > 1 ? `Best of ${m.bestOf}` : '';
    const st = m.status === 'live' ? ' <span class="lb-live">LIVE</span>' : '';
    return `<div class="card br-game lb-game ${m.status === 'live' ? 'live' : ''}"><div class="host">${esc([bo, head].filter(Boolean).join(' · '))}${st}</div>${(m.slots || []).map((s) => slot(s, m)).join('')}
      ${m.next && m.next.detail ? `<div class="lb-next">Next: Game ${esc(m.next.n)} · ${esc(m.next.detail)}</div>` : ''}</div>`;
  }
  const col = (r, sport) => `<div class="lb-col"><div class="br-h lb-h">${esc(r.name)}</div>${(r.matchups || []).map((m) => `<div class="lb-m">${matchup({ ...m, _sport: sport })}</div>`).join('')}</div>`;
  function bracketGrid(rounds, sport) {
    const rs = rounds.filter((r) => r.matchups && r.matchups.length);
    if (!rs.length) return '<div class="card empty">No games in this part of the bracket yet.</div>';
    return `<div class="br-scroll" tabindex="0" aria-label="Bracket, scroll sideways for later rounds"><div class="lb-grid">${rs.map((r) => col(r, sport)).join('')}</div></div><p class="br-hint faint small">Swipe sideways for later rounds →</p>`;
  }
  // which tabs a bracket has and what each shows: >2 groups (regions) get a separate "Final Four" tab; otherwise finals are appended
  function bracketTabs(b) {
    const g = b.groups || []; const fin = (b.finalRounds || []).filter((r) => r.matchups && r.matchups.length);
    const sep = g.length > 2;
    const tabs = g.map((x, i) => ({ id: x.id || String(i), name: x.name, rounds: sep ? x.rounds : [...x.rounds, ...fin] }));
    if (sep && fin.length) tabs.push({ id: 'finals', name: 'Final Four', rounds: fin });
    return tabs;
  }
  function seedsCards(b) {
    if (!b.seeds || !b.seeds.length) return '';
    return `<h2>The field</h2><div class="lb-field">${b.seeds.map((g) => `<div class="card br-list"><div class="lb-fh">${esc(g.name)}</div>${g.seeds.map((s) => `<div class="br-row ${hlCls(s.team)}" style="--tc:#${esc(s.team.color || '888')}"><span class="sd">${esc(s.seed)}</span><img src="${esc(logo(s.team))}" alt="" loading="lazy" /><span class="n"><b>${esc(s.team.short || s.team.name)}</b><small>${esc([s.record, s.tag].filter(Boolean).join(' · '))}</small></span></div>`).join('')}</div>`).join('')}</div>`;
  }
  function pollMini(p, d) {
    if (!p || !(p.rows || []).length) return '';
    return `<h2>${p.preseason ? 'Preseason' : 'Latest'} ${esc(p.name)}</h2><div class="card gk-list lb-list">${p.rows.slice(0, 10).map((r) => row(r, { ...d, kind: 'poll' })).join('')}</div>
      <p class="faint small">${esc(p.headline || p.name)}${p.date ? ` · ${esc(fmtDay(p.date))}` : ''}. <a href="#/rankings/list/${esc(d.sport)}">Full list ›</a></p>`;
  }
  function stageSection(sec, kind) {
    const adv = sec.advancer; const tm = sec.teams || [];
    const games = (sec.games || []).map((g) => { const [a, b] = g.slots || []; const nm = (s) => (s && s.team ? s.team.short || s.team.name : (s && s.label) || 'TBD');
      return `<div class="lb-g"><span class="faint">${esc(g.date || '')}</span><span class="${a && a.winner ? 'w' : ''}">${esc(nm(a))} <b>${a && a.score != null ? esc(a.score) : ''}</b></span><span class="${b && b.winner ? 'w' : ''}">${esc(nm(b))} <b>${b && b.score != null ? esc(b.score) : ''}</b></span></div>`; }).join('');
    return `<div class="card br-game lb-sec"><div class="host">${esc(sec.name)}${sec.complete ? '' : ' · in progress'}</div>
      ${tm.map((x) => `<div class="bt ${adv && x.team && adv.id && x.team.id === adv.id ? 'win' : ''} ${hlCls(x.team)}" style="--tc:#${esc((x.team && x.team.color) || '888')}"><span class="sd">${x.seed != null ? esc(x.seed) : ''}</span><img src="${esc(logo(x.team))}" alt="" loading="lazy" /><span class="n"><b>${esc((x.team && (x.team.short || x.team.name)) || 'TBD')}</b><small>${x.team && x.team.hl && x.team.hl.spot ? esc(x.team.hl.spot === 'utah' ? 'Utah' : 'BYU') : x.team && x.team.hl && x.team.hl.big12 ? 'Big 12' : adv && x.team && x.team.id && x.team.id === adv.id ? 'Advanced' : ''}</small></span><span class="lb-sc" title="${kind === 'series' ? 'series wins' : 'wins'}">${x.wins != null ? esc(x.wins) : ''}</span></div>`).join('')}
      ${games ? `<details class="lb-games"><summary>${(sec.games || []).length} game${(sec.games || []).length === 1 ? '' : 's'}</summary>${games}</details>` : ''}</div>`;
  }
  function stagesBody(d, stageId) {
    const st = d.stages || []; const cur = st.find((s) => s.id === stageId) || st[0];
    return `<div class="gk-sub"><div class="seg" role="tablist">${st.map((s) => `<button role="tab" data-lbstage="${esc(s.id)}" aria-selected="${s === cur}" class="${s === cur ? 'on' : ''}">${esc(s.name.replace(/^Men’s College World Series$/, 'Men’s CWS').replace(/ \(best of 3\)/, ''))}</button>`).join('')}</div></div>
      <h2>${esc(cur.name)}</h2><div class="lb-secs">${(cur.sections || []).map((s) => stageSection(s, cur.kind)).join('') || '<div class="card empty">No games in this round.</div>'}</div>`;
  }
  function champCard(d) {
    const c = d.champion; if (!c) return '';
    const t = c.team || c; const ru = c.runnerUp || d.runnerUp;
    return `<div class="card gk-hero lb-champ" style="--tc:#${esc(t.color || '888')}"><div class="gk-kicker">${c.label ? esc(c.label) : `${c.year ? `${esc(c.year)} ` : ''}national champion`}</div>
      <div class="lb-champrow"><img src="${esc(logo(t))}" alt="" /><div><div class="gk-title">${esc(t.short || t.name)}</div>
      <div class="gk-method">${[c.note ? esc(c.note) : ru ? `Beat ${esc(ru.short || ru.name)}` : '', c.score != null ? `${esc(c.score)}` : '', c.site ? esc(c.site) : '', c.coach ? `Coach ${esc(c.coach)}` : ''].filter(Boolean).join(' · ')}</div></div></div></div>`;
  }
  function gymBody(d) {
    return `${champCard(d)}
      <div class="card br-foot lb-format"><h3>How the championship works</h3><ul class="gk-how-list">${(d.format || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      ${(d.history || []).length ? `<h2>Recent champions</h2><div class="card br-list">${d.history.slice(0, 10).map((h) => `<div class="br-row ${hlCls(h.champion)}" style="--tc:#${esc((h.champion && h.champion.color) || '888')}"><span class="sd lb-yr">’${esc(String(h.year).slice(2))}</span><img src="${esc(logo(h.champion))}" alt="" loading="lazy" /><span class="n"><b>${esc((h.champion && (h.champion.short || h.champion.name)) || '')}${h.champion && h.champion.hl && h.champion.hl.spot ? ` ${spotTag(h.champion)}` : ''}</b><small>${[h.runnerUp ? `over ${esc(h.runnerUp.short || h.runnerUp.name)}` : '', h.points != null ? esc(h.points) : '', h.site ? esc(h.site) : ''].filter(Boolean).join(' · ')}</small></span></div>`).join('')}</div>` : ''}
      <p class="faint small">There is no single-elimination bracket in gymnastics. For rankings and live results: ${(d.links || []).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a>`).join(' · ')} · <a href="#/rankings/list/gymnastics">Team ranking ›</a></p>`;
  }
  function playoffsBody(d, ui = {}) {
    const hero = `<div class="card gk-hero lb-hero"><div class="gk-kicker">${esc(d.name)}</div><div class="gk-title lb-h1">${esc(d.headline || '')}</div>
      <div class="gk-src"><span class="gk-tag live">${esc(STATE[d.state] || d.state)}</span>${d.bracket && d.bracket.real === false ? '' : ''}${d.year ? `<span class="gk-tag">${esc(d.year)}</span>` : ''}</div>
      ${srcLine({ ...d, asOfLabel: d.asOf ? `checked ${fmtDay(d.asOf)}` : '' })}</div>${notes(d)}`;
    const foot = `<div class="card br-foot lb-format"><h3>Format</h3><ul class="gk-how-list">${(d.format || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${(d.links || []).length ? `<p class="faint small">More: ${d.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a>`).join(' · ')}</p>` : ''}</div>`;
    if (d.kind === 'championship') return hero + gymBody(d) ;
    if (d.stages && d.stages.length) return hero + champCard({ champion: d.champion && { team: d.champion }, runnerUp: d.runnerUp }) + stagesBody(d, ui.stage) + pollMini(d.poll, d) + foot;
    if (d.bracket && (d.bracket.groups || []).length) {
      const tabs = bracketTabs(d.bracket); const cur = tabs.find((t) => t.id === ui.group) || tabs[0];
      const ch = d.bracket.champion ? champCard({ champion: { team: d.bracket.champion, label: d.champLabel, note: d.champNote } }) : '';
      return hero + ch + (tabs.length > 1 ? `<div class="gk-sub"><div class="seg" role="tablist">${tabs.map((t) => `<button role="tab" data-lbgroup="${esc(t.id)}" aria-selected="${t === cur}" class="${t === cur ? 'on' : ''}">${esc(t.name)}</button>`).join('')}</div></div>` : '') +
        bracketGrid(cur.rounds, d.sport) + seedsCards(d.bracket) + pollMini(d.poll, d) + foot;
    }
    return hero + `<div class="card br-empty"><div class="gk-kicker">Bracket</div><h2 class="br-big">Not available yet</h2><p>${esc(d.headline || 'No bracket yet.')}</p></div>` + pollMini(d.poll, d) + foot;
  }
  const oneSeedBox = (d) => (d.oneSeeds ? `<div class="card nt"><h3>Projected 1-seed line</h3><p>${d.oneSeeds.map((s) => esc(s.team.short)).join(', ')}</p></div>` : '');
  return { row, listBody, playoffsBody, bracketTabs, stagesBody, gymBody, matchup, methodCard, oneSeedBox };
}

// ---------------- DOM controller ----------------
export function createLists(ctx) {
  const { view, api, mem, setBar, LT, paint, SK, tick, S, SPORTS, logo, myTeamIds, openCfb } = ctx;
  const R = makeRender({ logo, myTeamIds });
  const ui = { poll: {}, group: {}, stage: {} };
  const name = (id) => (SPORTS[id] || {}).name || id;
  const withTimeout = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('The server is taking too long to respond. It may be waking up; try again in a moment.')), TIMEOUT))]);
  const err = (msg) => `<div class="card empty br-err" role="alert"><b>Couldn’t load this.</b><p>${esc(msg)}</p><button class="btn" data-lbretry="1">Try again</button></div>`;
  function picker(sport, page) {
    const chips = pickerOrder(S).map((id) => `<button role="tab" data-lbsport="${id}" aria-selected="${id === sport}" class="${id === sport ? 'on' : ''}">${esc((SPORTS[id] || {}).emoji || '')} ${esc((SPORTS[id] || {}).short || id)}</button>`).join('');
    return `<div class="gk-sub lb-pick"><div class="seg" role="tablist" aria-label="Sport">${chips}</div></div>
      <div class="seg br-seg lb-pages" role="tablist"><button role="tab" data-lbpage="list" aria-selected="${page === 'list'}" class="${page === 'list' ? 'on' : ''}">Top list</button><button role="tab" data-lbpage="playoffs" aria-selected="${page === 'playoffs'}" class="${page === 'playoffs' ? 'on' : ''}">Bracket</button></div>`;
  }
  const wire = (sport, page, rerender) => {
    view.querySelectorAll('[data-lbsport]').forEach((b) => (b.onclick = () => { tick(); location.hash = `#/rankings/${page === 'list' ? 'list' : 'playoffs'}/${b.dataset.lbsport}`; }));
    view.querySelectorAll('[data-lbpage]').forEach((b) => (b.onclick = () => { tick(); location.hash = `#/rankings/${b.dataset.lbpage === 'list' ? 'list' : 'playoffs'}/${sport}`; }));
    const on = view.querySelector('.lb-pick .seg .on'); if (on && on.scrollIntoView) { try { on.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch { /* ignore */ } }
    const r = view.querySelector('[data-lbretry]'); if (r) r.onclick = () => { mem.delete(`/api/${page === 'list' ? 'lists' : 'playoffs'}/${sport}`); rerender(false); };
  };
  async function viewPage(page, sport, quick) {
    if (!FEED.includes(sport)) { location.replace('#/rankings/lists'); return; }
    const kind = page === 'list' ? 'lists' : 'playoffs';
    const title = page === 'list' ? 'Top List' : 'Bracket';
    setBar(`${name(sport)} ${title}`, { back: '#/rankings/lists' });
    const head = LT(`${esc(name(sport))}`, page === 'list' ? 'JT top list' : 'Championship & playoff bracket') + picker(sport, page);
    if (!quick) paint(head + `<p class="faint small br-loading" role="status">Loading ${page === 'list' ? 'the list' : 'the bracket'}…</p>` + SK.rows(8));
    const redo = (q) => viewPage(page, sport, q);
    let d;
    try { d = await withTimeout(api(`/api/${kind}/${sport}`, page === 'list' ? 10 * 60e3 : 2 * 60e3)); } catch (e) { view.innerHTML = head + err(e.message || 'Network error.'); wire(sport, page, redo); return; }
    try {
      const rerender = () => { view.innerHTML = head + (page === 'list' ? R.listBody(d, ui.poll[sport]) : R.playoffsBody(d, { group: ui.group[sport], stage: ui.stage[sport] })) + `<p class="faint small">Generated ${esc(new Date().toLocaleTimeString())}. Nothing on this page is estimated or invented; see the source and method above.</p>`; bind(); };
      const bind = () => {
        wire(sport, page, redo);
        view.querySelectorAll('[data-lbpoll]').forEach((b) => (b.onclick = () => { tick(); ui.poll[sport] = b.dataset.lbpoll; rerender(); }));
        view.querySelectorAll('[data-lbgroup]').forEach((b) => (b.onclick = () => { tick(); ui.group[sport] = b.dataset.lbgroup; rerender(); }));
        view.querySelectorAll('[data-lbstage]').forEach((b) => (b.onclick = () => { tick(); ui.stage[sport] = b.dataset.lbstage; rerender(); }));
      };
      rerender();
    } catch (e) { console.error(e); view.innerHTML = head + err(`Something went wrong showing it (${e.message}).`); wire(sport, page, redo); }
  }
  function hub() {
    setBar('Rankings & Brackets', { back: '#/rankings' });
    const li = {
      nfl: ['JT Power Rankings', '14-team projected bracket'], nba: ['JT Power Rankings', 'Play-in + 16-team bracket'], wnba: ['JT Power Rankings', 'Postseason bracket'], mlb: ['JT Power Rankings', '12-team postseason'],
      mcbb: ['AP Top 25', '68-team NCAA tournament'], wcbb: ['AP Top 25', '68-team NCAA tournament'], cbase: ['D1Baseball Top 25', 'Regionals → College World Series'], softball: ['Top 25 poll', 'Regionals → Women’s College World Series'], ausl: ['Standings', 'Play-in → AUSL Championship'], gymnastics: ['Team ranking', 'Regionals → national championship'],
    };
    const cards = pickerOrder(S).map((id) => `<div class="card lb-card"><div class="lb-ch"><span class="lb-em">${esc((SPORTS[id] || {}).emoji || '')}</span><b>${esc(name(id))}</b></div>
      <div class="lb-cl"><a class="btn small" href="#/rankings/list/${id}">${esc(li[id][0])} ›</a><a class="btn small" href="#/rankings/playoffs/${id}">${esc(li[id][1])} ›</a></div></div>`).join('');
    view.innerHTML = LT('Rankings & Brackets', 'A top list and a championship bracket for every sport') + `<div class="lb-hub">${cards}
      <div class="card lb-card"><div class="lb-ch"><span class="lb-em">${esc((SPORTS.cfb || {}).emoji || '🏈')}</span><b>College Football</b></div><div class="lb-cl"><a class="btn small" href="#/rankings/grok" data-lbcfb="#/rankings/grok">JT Top 25 ›</a><a class="btn small" href="#/rankings/bracket" data-lbcfb="#/rankings/bracket">12-team playoff bracket ›</a></div></div></div>
      <p class="faint small">Lists are computed from real standings with a published formula, or are the official poll. Brackets use real results when they exist and are labelled as projections when they don’t.</p>`;
    view.querySelectorAll('[data-lbcfb]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); tick(); openCfb(a.dataset.lbcfb); }));
  }
  function show(quick) {
    const h = parseHash(location.hash); if (!h) return false;
    if (h.page === 'lists' || !h.sport) hub(); else viewPage(h.page === 'list' ? 'list' : 'playoffs', h.sport, quick);
    return true;
  }
  // a small card for the Rankings tab / Home / other pages; sport-aware, hides nothing if the feed is unknown
  const promo = (sport) => FEED.includes(sport)
    ? `<a class="card gk-promo lb-promo" href="#/rankings/list/${sport}"><div><div class="gk-kicker">New · ${esc(name(sport))}</div><div class="gk-title">Top list &amp; bracket</div><div class="faint small">Power rankings or poll · championship bracket · all sports</div></div><span class="go">View ›</span></a>`
    : `<a class="card gk-promo lb-promo" href="#/rankings/lists"><div><div class="gk-kicker">New</div><div class="gk-title">Rankings &amp; Brackets</div><div class="faint small">A top list and a bracket for NFL, NBA, WNBA, college hoops, MLB, baseball, softball, gymnastics</div></div><span class="go">View ›</span></a>`;
  const hubPromo = () => `<a class="card gk-promo lb-promo" href="#/rankings/lists"><div><div class="gk-kicker">All sports</div><div class="gk-title">Rankings &amp; Brackets</div><div class="faint small">Top lists and championship brackets</div></div><span class="go">View ›</span></a>`;
  return { show, promo, hubPromo, hub, viewPage, R };
}
