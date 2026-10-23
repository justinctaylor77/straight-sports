import { LEAGUE_MUTES, DEFAULTS, SPORTS, SPORT_IDS, sportOfId, loadSettings, saveSettings, teamMatcher, buildMuteFilter, cluster, timeAgo, itemText, tokens, similar } from './lib.js';
import { renderGamecast, castTitle, castState, golfRow, tennisMatch } from './gamecast.js';

// ---------------- state ----------------
let S = loadSettings();
let TEAMS = []; let CONFS = []; let SOURCES = [];
const TEAMS_BY = { cfb: [], nfl: [], mlb: [] }; const DIVS_BY = { cfb: [], nfl: [], mlb: [] };
const PLAYERS_BY = {}; // golf / tennis player lists, loaded on demand
const SP = () => S.sport; const SPI = () => SPORTS[S.sport];
const teamSport = (sp) => ['cfb', 'nfl', 'mlb'].includes(sp);
const view = document.getElementById('view');
let refreshTimer = null;
let SILENT = false; // true during background refreshes (no skeleton flash)
const mem = new Map();
const ITEMS = new Map(); const GROUPS = new Map(); let POOL = [];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
// Teams (all team sports) and followed/muted players share one id space: "252" (CFB), "nfl:3", "mlb:8", "golf:9478", "tennis:3623".
const playerEnt = (id) => { const p = S.players[id]; return p ? { id, name: p.name, short: p.name, location: p.name, logo: p.flag, logoDark: p.flag, sport: sportOfId(id), player: true } : null; };
const teamById = (id) => TEAMS.find((t) => t.id === String(id)) || playerEnt(String(id));
const entities = () => [...TEAMS, ...Object.keys(S.players).map(playerEnt)];
const followsIn = (sp) => S.follow.filter((id) => sportOfId(id) === sp);
const follows = (id) => S.follow.includes(String(id));
const rememberPlayer = (id, name, flag) => { S.players[id] = { name, flag: flag || '' }; };
const isDark = () => (S.theme === 'dark') || (S.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
const logo = (t) => (t ? (isDark() ? t.logoDark || t.logo : t.logo) : '');
const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const tick = () => { try { navigator.vibrate && navigator.vibrate(8); } catch { /* unsupported */ } };

async function api(path, ttl = 60e3) {
  const hit = mem.get(path);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  const v = await r.json(); mem.set(path, { t: Date.now(), v }); return v;
}
function save() { saveSettings(S); renderSideTeams(); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200); }
function applyTheme() {
  if (S.theme === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = S.theme;
  // one theme-color that matches the app background, so the status bar blends in when installed
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  metas.forEach((m, i) => { if (i) m.remove(); else { m.removeAttribute('media'); m.content = isDark() ? '#0f1216' : '#f6f7f9'; } });
}

// ---------------- app bar (sticky compact header) ----------------
const AB = { title: $('#ab-title'), back: $('#ab-back'), action: $('#ab-action') };
function setBar(title, { back = '', action = '' } = {}) {
  AB.title.textContent = title; AB.back.hidden = !back; AB.back.dataset.to = back; AB.action.innerHTML = action;
  document.body.classList.toggle('has-back', !!back);
}
AB.back.onclick = () => { tick(); if (HIST.length > 1) history.back(); else location.hash = AB.back.dataset.to; };
addEventListener('scroll', () => document.body.classList.toggle('scrolled', scrollY > 30), { passive: true });
const LT = (title, sub = '') => `<div class="lt"><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>`;
const paint = (html) => { if (!SILENT) view.innerHTML = html; };

// ---------------- skeletons ----------------
const rep = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('');
const SK = {
  games: (n = 3) => `<div class="grid">${rep(n, () => `<div class="card game sk-card"><div class="sk w35 sm"></div>${rep(2, () => '<div class="sk-row"><span class="sk logo"></span><span class="sk w50"></span><span class="sk w10 r"></span></div>')}<div class="sk w60 sm"></div></div>`)}</div>`,
  news: (n = 6) => `<div class="card panel">${rep(n, (i) => `<div class="item sk-item"><div class="sk w${[90, 80, 95, 70, 85, 75][i % 6]}"></div><div class="sk w60"></div><div class="sk w25 sm"></div></div>`)}</div>`,
  rows: (n = 8) => `<div class="card panel">${rep(n, () => '<div class="sk-row tall"><span class="sk w5"></span><span class="sk logo"></span><span class="sk w40"></span><span class="sk w15 r"></span></div>').replace(/w5"/g, 'w5" style="width:22px"')}</div>`,
  sub: () => '<span class="sk w40 sm inline"></span>',
};

// ---------------- filters ----------------
let _mf = null; let _mfKey = '';
function muteFilter() {
  const k = JSON.stringify([S.muteKeywords, S.muteLeagues, S.muteTeams, S.sportOnly, TEAMS.length, S.sport]);
  if (k !== _mfKey) { _mf = buildMuteFilter(S, entities(), S.sport); _mfKey = k; }
  return _mf;
}
let _fm = null; let _fmKey = '';
function followMatchers() {
  const k = JSON.stringify([S.follow, TEAMS.length, S.sport]);
  if (k !== _fmKey) { _fm = followsIn(S.sport).map(teamById).filter(Boolean).map((t) => ({ t, m: teamMatcher(t, TEAMS, S.sport) })); _fmKey = k; }
  return _fm;
}
const sportSources = (sp = S.sport) => SOURCES.filter((s) => s.sport === sp);
const sourceOn = (id) => (id in S.sources ? S.sources[id] : (SOURCES.find((s) => s.id === id) || {}).defaultOn);
const blocked = (name) => (S.blockOutlets || []).some((b) => name.toLowerCase().includes(b.toLowerCase()));

// Apply every user filter to news. Returns {items, hidden:{mute, opinion, outlet}}
function filterNews(items, { straight = S.straightOnly } = {}) {
  const mf = muteFilter(); const fm = followMatchers();
  const out = []; const hidden = { mute: 0, opinion: 0, outlet: 0 };
  for (const it of items) {
    if (blocked(it.source)) { hidden.outlet++; continue; }
    const why = mf.item(it); if (why) { hidden.mute++; continue; }
    if (straight && it.type !== 'news') { hidden.opinion++; continue; }
    const txt = itemText(it);
    const mine = fm.filter((x) => x.m(txt)).map((x) => x.t.id);
    out.push({ ...it, mine });
  }
  POOL = out;
  return { items: out, hidden };
}
function newsPath(extraTeams, sp = S.sport) {
  const src = sportSources(sp).filter((s) => sourceOn(s.id)).map((s) => s.id).join(',');
  const ids = extraTeams ? [extraTeams] : followsIn(sp);
  const q = teamSport(sp) ? `&teams=${encodeURIComponent(ids.join(','))}` : `&names=${encodeURIComponent(ids.map((id) => (teamById(id) || {}).name).filter(Boolean).join('|'))}`;
  return `/api/news?sport=${sp}&sources=${encodeURIComponent(src)}${q}`;
}

// ---------------- shared renderers ----------------
function teamRow(c, ev) {
  const t = c.team || {};
  const lost = ev.state === 'post' && !c.winner && (ev.home.winner || ev.away.winner);
  const mine = S.follow.includes(t.id);
  const poss = ev.state === 'in' && ev.possession && ev.possession === t.id;
  return `<div class="trow ${lost ? 'lost' : ''}">
    <img src="${esc(logo(t))}" alt="" loading="lazy" width="28" height="28" />
    <a class="nm" href="#/team/${t.id}">${c.rank ? `<span class="rk">${c.rank}</span>` : ''}<b>${esc(t.short || t.name)}</b>${mine ? '<span class="star" title="Following">●</span>' : ''}${poss ? '<span class="poss" title="Possession">◂</span>' : ''}<span class="rec">${esc(c.record || '')}</span></a>
    <span class="sc">${ev.state === 'pre' ? '' : esc(c.score ?? '')}</span></div>`;
}
function gameCard(ev) {
  const mine = S.follow.includes(ev.home.team?.id) || S.follow.includes(ev.away.team?.id);
  let status;
  if (ev.state === 'in') status = `<span class="live">LIVE · ${esc(ev.detail)}</span>`;
  else if (ev.state === 'post') status = `<b>${esc(ev.detail)}</b>`;
  else {
    const d = new Date(ev.date);
    status = `<span>${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${/TBD/.test(ev.detail) ? 'TBD' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>`;
  }
  const sp = ev.sport || 'cfb';
  const live = ev.state === 'in' ? (ev.downDistance ? `<span class="sit">${esc(ev.downDistance)}</span>` : ev.bases ? `<span class="sit">${miniBases(ev.bases)}${esc(ev.bases.outs)} out</span>` : '') : '';
  const extra = ev.state === 'pre' && ev.probable ? `<span>${esc(ev.probable)}</span>` : '';
  return `<div class="card game ${mine ? 'mine' : ''}" data-game="#/game/${sp}/${esc(ev.id)}" role="link" tabindex="0" aria-label="Gamecast: ${esc(ev.name || '')}">
    ${ev.note ? `<div class="gnote">${esc(ev.note)}${ev.series && !/starts/i.test(ev.series) ? ` · ${esc(ev.series)}` : ''}</div>` : ''}
    <div class="status">${status}<span>${esc(ev.broadcast || '')}</span></div>
    ${teamRow(ev.away, ev)}${teamRow(ev.home, ev)}
    <div class="meta">${live}${extra}<span>${esc(ev.venue || '')}</span>${ev.conferenceGame ? '<span>· Conf</span>' : ''}${ev.neutral ? '<span>· Neutral</span>' : ''}<span class="gc-go">Gamecast ›</span></div></div>`;
}
const miniBases = (b) => `<svg class="mini-bases" viewBox="0 0 30 20" aria-label="Runners"><rect x="20" y="8" width="6" height="6" transform="rotate(45 23 11)" class="${b.on1 ? 'on' : ''}"/><rect x="12" y="1" width="6" height="6" transform="rotate(45 15 4)" class="${b.on2 ? 'on' : ''}"/><rect x="4" y="8" width="6" height="6" transform="rotate(45 7 11)" class="${b.on3 ? 'on' : ''}"/></svg>`;
const TYPE_LABEL = { opinion: 'Opinion', analysis: 'Analysis', betting: 'Betting', media: 'Video/Audio' };
function newsItem(it) {
  ITEMS.set(it.link, it);
  return `<div class="item" data-story="${esc(it.link)}" role="button" tabindex="0">
    <div class="t">${esc(it.title)}</div>${it.summary ? `<div class="s">${esc(it.summary)}</div>` : ''}
    <div class="m"><span class="src">${esc(it.source)}</span>${it.type !== 'news' ? `<span class="tag">${TYPE_LABEL[it.type]}</span>` : ''}<span>${timeAgo(it.published)}</span>${it.via && it.via !== it.source ? `<span class="faint">via ${esc(it.via)}</span>` : ''}</div></div>`;
}
function clusterCard(group) {
  const bySource = []; const seen = new Set();
  for (const it of group) { if (seen.has(it.source)) continue; seen.add(it.source); bySource.push(it); }
  bySource.forEach((it) => { ITEMS.set(it.link, it); GROUPS.set(it.link, bySource); });
  return `<div class="card cluster"><div class="head">Same story · ${bySource.length} sources</div>
    ${bySource.slice(0, 6).map((it) => `<div class="crow" data-story="${esc(it.link)}" role="button" tabindex="0"><span class="src">${esc(it.source)}</span><span class="ct">${esc(it.title)} <span class="faint small">· ${timeAgo(it.published)}</span></span></div>`).join('')}</div>`;
}
function topClusters(items, n) {
  return cluster(items).filter((g) => new Set(g.map((x) => x.source)).size >= 2)
    .map((g) => ({ g, score: new Set(g.map((x) => x.source)).size * 2 + (g.some((x) => x.mine && x.mine.length) ? 6 : 0) - (Date.now() - Date.parse(g[0].published || 0)) / 36e5 / 12 }))
    .sort((a, b) => b.score - a.score).slice(0, n).map((x) => x.g);
}
function activeMutes() {
  const out = []; const seen = new Set();
  for (const v of [...S.muteKeywords, ...S.muteLeagues.map((l) => (LEAGUE_MUTES[l] || {}).label), ...S.muteTeams.map((id) => (teamById(id) || {}).short)]) {
    if (!v || seen.has(v.toLowerCase())) continue; seen.add(v.toLowerCase()); out.push(v);
  }
  return out;
}
function hiddenNotice(h) {
  const parts = [];
  if (h.mute) parts.push(`${h.mute} muted`);
  if (h.opinion) parts.push(`${h.opinion} opinion/analysis/betting`);
  if (h.outlet) parts.push(`${h.outlet} from blocked outlets`);
  const active = activeMutes();
  const muting = active.length ? `<span>🔇 Muting: <b>${active.map(esc).join(', ')}</b></span>` : '';
  return parts.length || muting ? `<div class="notice">${muting}${parts.length ? `<span>Hidden: ${parts.join(' · ')}</span>` : ''}<a class="btn small" href="#/settings/mute">Edit</a></div>` : '';
}
const errBox = (e) => `<div class="empty">Couldn’t load data: ${esc(e.message)}. <button class="btn small" onclick="location.reload()">Retry</button></div>`;

function sortGames(a, b) {
  const o = { in: 0, pre: 1, post: 2 };
  return (o[a.state] - o[b.state]) || (a.state === 'post' ? Date.parse(b.date) - Date.parse(a.date) : Date.parse(a.date) - Date.parse(b.date));
}
function renderSideTeams() {
  const el = $('#side-teams'); if (!el) return;
  const l = S.follow.map(teamById).filter(Boolean).filter((t) => S.sports.includes(t.sport || 'cfb'));
  el.innerHTML = l.length ? `<div class="side-lbl">Following</div>${l.map((t) => `<a href="${t.player ? `#/scores` : `#/team/${t.id}`}" data-team="${t.id}" data-sp="${t.sport || 'cfb'}"><img src="${esc(logo(t))}" alt="" width="22" height="22" class="${t.player ? 'flag' : ''}" /><span>${esc(t.short)}</span><small>${esc(SPORTS[t.sport || 'cfb'].short)}</small></a>`).join('')}` : '';
}

// ---------------- views ----------------
const sbPath = (sp, extra = '') => `/api/scoreboard?sport=${sp}${extra}`;
const isMineEv = (e) => S.follow.includes(e.home.team?.id) || S.follow.includes(e.away.team?.id);
const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA');
const dayLabel = (iso) => { const k = dayKey(iso); const t = dayKey(new Date().toISOString()); const y = dayKey(new Date(Date.now() - 864e5).toISOString()); const tm = dayKey(new Date(Date.now() + 864e5).toISOString());
  return k === t ? 'Today' : k === y ? 'Yesterday' : k === tm ? 'Tomorrow' : new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }); };
const noFollowMsg = (sp) => `Follow ${SPORTS[sp].what} in <a href="#/settings/teams">Settings</a> to see them here.`;

async function newsColumn(html, news, title = 'Top stories for you') {
  html += `<section><h2>${title}<a class="h2-link" href="#/news">All news ›</a></h2>`;
  if (news.status === 'fulfilled') {
    const { items, hidden } = filterNews(news.value.items);
    const prefer = followsIn(S.sport).length ? items.filter((i) => i.mine.length) : items;
    const pool = prefer.length >= 6 ? prefer : items;
    const cl = topClusters(pool, 3); const used = new Set(cl.flat().map((x) => x.link));
    html += cl.map(clusterCard).join('');
    html += `<div class="card panel news-list">${pool.filter((i) => !used.has(i.link)).slice(0, 14).map(newsItem).join('') || '<div class="empty">No stories match your filters.</div>'}</div>`;
    html += hiddenNotice(hidden);
  } else html += errBox(news.reason);
  return html + '</section>';
}

async function viewHome() {
  setBar('Home');
  const sp = S.sport;
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  paint(LT(SPORTS[sp].name, today) + `<div class="cols"><section><h2>${sp === 'golf' ? 'This week' : sp === 'tennis' ? 'Your players' : 'Your games'}</h2>${SK.games(3)}</section><section><h2>Top stories for you</h2>${SK.news(6)}</section></div>`);
  if (sp === 'golf') return homeGolf(today);
  if (sp === 'tennis') return homeTennis(today);
  const [sb, news] = await Promise.allSettled([api(sbPath(sp), 30e3), api(newsPath(), 5 * 60e3)]);
  const mf = muteFilter();
  let html = '';
  if (sb.status === 'fulfilled') {
    const evs = sb.value.events.filter((e) => !mf.game(e));
    let mine = evs.filter(isMineEv).sort(sortGames);
    if (sp === 'mlb') { // one per team: live, else next, else latest
      const pick = new Map(); for (const e of mine) for (const id of [e.home.team.id, e.away.team.id]) if (S.follow.includes(id) && !pick.has(id)) pick.set(id, e);
      mine = [...new Set(pick.values())].sort(sortGames);
    }
    const confSet = new Set(S.conferences);
    const live = evs.filter((e) => e.state === 'in' && !mine.includes(e) && (sp !== 'cfb' || !confSet.size || confSet.has(e.home.conferenceId) || confSet.has(e.away.conferenceId)));
    const sub = sp === 'mlb' ? today : `Week ${esc(sb.value.week)} · ${today}`;
    html += LT(SPORTS[sp].name, sub);
    html += `<div class="cols"><section><h2>Your games <span class="count">${mine.length}</span><a class="h2-link" href="#/scores">All scores ›</a></h2>`;
    html += mine.length ? `<div class="grid">${mine.map(gameCard).join('')}</div>` : `<div class="card empty">${followsIn(sp).length ? (sp === 'mlb' ? 'No games for your teams in the last week or next few days.' : 'No games for your teams this week (bye week?).') : noFollowMsg(sp)}</div>`;
    if (live.length) html += `<h2>Live now <span class="count">${live.length}</span></h2><div class="grid">${live.slice(0, 6).map(gameCard).join('')}</div>`;
    if (!mine.length && !live.length) {
      const next = evs.filter((e) => e.state !== 'post').sort(sortGames).slice(0, 4);
      if (next.length) html += `<h2>Coming up</h2><div class="grid">${next.map(gameCard).join('')}</div>`;
    }
    if (followsIn(sp).length) {
      try {
        if (sp === 'cfb') {
          const rk = await api('/api/rankings?sport=cfb', 10 * 60e3);
          const ap = rk.polls.find((p) => p.id === 'ap');
          const ranked = ap ? ap.ranks.filter((r) => S.follow.includes(r.team.id)) : [];
          html += `<h2>Your teams in the AP poll<a class="h2-link" href="#/rankings">Top 25 ›</a></h2><div class="card panel">${ranked.length ? ranked.map(rankRow).join('') : '<div class="empty">None of your teams are ranked this week.</div>'}</div>`;
        } else {
          const st = await api(`/api/rankings?sport=${sp}`, 10 * 60e3);
          const rows = st.groups.flatMap((g) => g.rows.map((r) => ({ ...r, div: g.name }))).filter((r) => S.follow.includes(r.team.id));
          if (rows.length) html += `<h2>Your teams in the standings<a class="h2-link" href="#/rankings">Standings ›</a></h2><div class="card panel">${rows.map((r) => standRow(r, sp, true)).join('')}</div>`;
        }
      } catch { /* optional */ }
    }
    html += `</section>`;
  } else html += LT(SPORTS[sp].name, today) + `${errBox(sb.reason)}<div class="cols"><section></section>`;
  html = await newsColumn(html, news);
  view.innerHTML = html + '</div>';
  scheduleRefresh(sb.status === 'fulfilled' && sb.value.events.some((e) => e.state === 'in'));
}

// golf: tournament card (leaders + your players)
function golfTourCard(t, n = 10) {
  const ctx = castCtx(); const mf = muteFilter();
  const mine = t.players.filter((p) => follows(p.id));
  const top = t.players.filter((p) => !mf.teamId(p.id)).slice(0, n);
  return `<div class="card tour-card" data-game="#/game/golf/${esc(t.id)}" role="link" tabindex="0">
    <div class="status">${t.state === 'in' ? `<span class="live">LIVE · ${esc(t.detail)}</span>` : `<b>${esc(t.detail || '')}</b>`}<span>${esc(t.tour)}</span></div>
    <div class="tc-name">${esc(t.name)}</div><div class="faint small">${[t.course, t.purse && `Purse ${t.purse}`].filter(Boolean).map(esc).join(' · ')}</div>
    ${mine.length ? `<div class="lbl">Your players</div><div class="lb mini">${mine.map((p) => golfRow(p, ctx)).join('')}</div>` : ''}
    <div class="lbl">Leaders</div><div class="lb mini">${top.map((p) => golfRow(p, ctx)).join('')}</div>
    <div class="meta"><span class="gc-go">Full leaderboard & scorecards ›</span></div></div>`;
}
async function homeGolf(today) {
  const [gb, news] = await Promise.allSettled([api(sbPath('golf'), 30e3), api(newsPath(), 5 * 60e3)]);
  let html = LT('Golf', today) + '<div class="cols"><section>';
  if (gb.status === 'fulfilled') {
    const ts = gb.value.tournaments;
    html += `<h2>This week <span class="count">${ts.length}</span><a class="h2-link" href="#/scores">Leaderboards ›</a></h2>`;
    html += ts.length ? ts.map((t) => golfTourCard(t, 5)).join('') : '<div class="card empty">No tournaments this week.</div>';
    if (!followsIn('golf').length) html += `<div class="notice">${noFollowMsg('golf')}</div>`;
  } else html += errBox(gb.reason);
  html += '</section>';
  html = await newsColumn(html, news);
  view.innerHTML = html + '</div>';
  scheduleRefresh(gb.status === 'fulfilled' && gb.value.tournaments.some((t) => t.state === 'in'));
}
// tennis: your players' matches, live matches, latest results
async function homeTennis(today) {
  const [tb, news] = await Promise.allSettled([api(sbPath('tennis'), 30e3), api(newsPath(), 5 * 60e3)]);
  let html = LT('Tennis', today) + '<div class="cols"><section>';
  const ctx = castCtx(); const mf = muteFilter();
  let anyLive = false;
  if (tb.status === 'fulfilled') {
    const all = tb.value.tournaments.flatMap((t) => t.matches.map((m) => ({ ...m, tname: t.name }))).filter((m) => !mf.game(m) && /Singles/.test(m.draw));
    anyLive = all.some((m) => m.state === 'in');
    const ord = { in: 0, pre: 1, post: 2 };
    const sortM = (a, b) => (ord[a.state] - ord[b.state]) || (a.state === 'post' ? Date.parse(b.date) - Date.parse(a.date) : Date.parse(a.date) - Date.parse(b.date));
    const mine = all.filter((m) => m.players.some((p) => follows(p.id))).sort(sortM).slice(0, 8);
    html += `<h2>Your players <span class="count">${mine.length}</span><a class="h2-link" href="#/scores">All draws ›</a></h2>`;
    html += mine.length ? `<div class="grid">${mine.map((m) => tennisMatch(m, ctx)).join('')}</div>` : `<div class="card empty">${followsIn('tennis').length ? 'Your players have no matches at this week’s events.' : noFollowMsg('tennis')}</div>`;
    const live = all.filter((m) => m.state === 'in' && !mine.includes(m));
    if (live.length) html += `<h2>Live now <span class="count">${live.length}</span></h2><div class="grid">${live.slice(0, 8).map((m) => tennisMatch(m, ctx)).join('')}</div>`;
    const res = all.filter((m) => m.state === 'post' && !mine.includes(m)).sort(sortM).slice(0, 6);
    if (res.length) html += `<h2>Latest results</h2><div class="grid">${res.map((m) => tennisMatch(m, ctx)).join('')}</div>`;
    html += `<p class="faint small">This week: ${tb.value.tournaments.map((t) => `${esc(t.tour)} ${esc(t.name)}`).join(' · ')}</p>`;
  } else html += errBox(tb.reason);
  html += '</section>';
  html = await newsColumn(html, news);
  view.innerHTML = html + '</div>';
  scheduleRefresh(anyLive);
}

let scoresMode = null; let scoresWeek = ''; let golfLeague = 'pga'; let tennisT = ''; let tennisDraw = "Men's Singles";
async function viewScores(quick) {
  const sp = S.sport;
  setBar('Scores');
  if (sp === 'golf') return scoresGolf(quick);
  if (sp === 'tennis') return scoresTennis(quick);
  if (!scoresMode) scoresMode = S.conferences.length ? 'conf' : 'all';
  const wk = scoresWeek && sp !== 'mlb' ? `&week=${scoresWeek.split(':')[1]}&seasontype=${scoresWeek.split(':')[0]}` : '';
  const path = sbPath(sp, wk);
  if (!quick) paint(LT('Scores', SK.sub()) + `<div class="toolbar sticky"><span class="sk w30 btnlike"></span><span class="sk w40 btnlike"></span></div><h2>Your teams</h2>${SK.games(3)}<h2><span class="sk w15 sm inline"></span></h2>${SK.games(6)}`);
  let sb;
  try { sb = await api(path, 30e3); } catch (e) { view.innerHTML = LT('Scores') + errBox(e); return; }
  const mf = muteFilter();
  const all = sb.events; const evs = all.filter((e) => !mf.game(e)); const mutedCount = all.length - evs.length;
  const mine = evs.filter(isMineEv).sort(sortGames);
  const rest = evs.filter((e) => !isMineEv(e));
  const sections = []; const placed = new Set();
  let toolbar = ''; let sub = '';
  if (sp === 'cfb') {
    const confIds = scoresMode === 'all' || !S.conferences.length ? CONFS.map((c) => c.id) : S.conferences;
    for (const cid of confIds) {
      const c = CONFS.find((x) => x.id === cid); if (!c) continue;
      const games = rest.filter((e) => !placed.has(e.id) && (e.home.conferenceId === cid || e.away.conferenceId === cid)).sort(sortGames);
      games.forEach((g) => placed.add(g.id));
      if (games.length) sections.push(`<h2>${esc(c.short)} <span class="count">${games.length}</span></h2><div class="grid">${games.map(gameCard).join('')}</div>`);
    }
    if (scoresMode === 'all') {
      const other = rest.filter((e) => !placed.has(e.id)).sort(sortGames);
      if (other.length) sections.push(`<h2>Other <span class="count">${other.length}</span></h2><div class="grid">${other.map(gameCard).join('')}</div>`);
    }
  } else {
    // NFL / MLB: by day (latest results last for past days, upcoming first)
    const live = rest.filter((e) => e.state === 'in');
    if (live.length) sections.push(`<h2>Live <span class="count">${live.length}</span></h2><div class="grid">${live.sort(sortGames).map(gameCard).join('')}</div>`);
    const byDay = new Map();
    for (const e of rest.filter((x) => x.state !== 'in').sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) { const k = dayKey(e.date); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(e); }
    const days = [...byDay.entries()];
    const up = days.filter(([, g]) => g.some((e) => e.state === 'pre')); const past = days.filter(([, g]) => !g.some((e) => e.state === 'pre')).reverse();
    for (const [, g] of [...up, ...past]) sections.push(`<h2>${esc(dayLabel(g[0].date))} <span class="count">${g.length}</span></h2><div class="grid">${g.map(gameCard).join('')}</div>`);
  }
  if (sp !== 'mlb') {
    const cur = `${sb.seasontype}:${sb.week}`; const sel = (scoresWeek || cur);
    const curLabel = (sb.calendar.find((w) => `${w.seasontype}:${w.week}` === sel) || {});
    const weekOpts = sb.calendar.map((w) => `<option value="${w.seasontype}:${w.week}" ${`${w.seasontype}:${w.week}` === sel ? 'selected' : ''}>${esc(w.label)}${w.detail ? ` (${esc(w.detail)})` : ''}</option>`).join('');
    toolbar = `<select class="btn" id="week" aria-label="Week" data-cur="${cur}">${weekOpts}</select>`;
    sub = `${esc(curLabel.label || `Week ${sb.week}`)}${curLabel.detail ? ` · ${esc(curLabel.detail)}` : ''} · your local time`;
    if (sp === 'cfb') toolbar += `<div class="seg" role="tablist"><button data-mode="mine" class="${scoresMode === 'mine' ? 'on' : ''}">My teams</button><button data-mode="conf" class="${scoresMode === 'conf' ? 'on' : ''}">My confs</button><button data-mode="all" class="${scoresMode === 'all' ? 'on' : ''}">All FBS</button></div>`;
  } else sub = 'Last 7 days and the next 3 · your local time';
  view.innerHTML = LT('Scores', sub) + `
    ${toolbar ? `<div class="toolbar sticky">${toolbar}</div>` : ''}
    ${mutedCount ? `<div class="notice">${mutedCount} game${mutedCount > 1 ? 's' : ''} hidden (muted teams)</div>` : ''}
    <h2>Your teams <span class="count">${mine.length}</span></h2>
    ${mine.length ? `<div class="grid">${mine.map(gameCard).join('')}</div>` : `<div class="card empty">${followsIn(sp).length ? 'No games for your teams in this window.' : `You aren’t following any ${esc(SPORTS[sp].short)} teams yet. <a href="#/settings/teams">Pick teams</a>.`}</div>`}
    ${sp === 'cfb' && scoresMode === 'mine' ? '' : (sections.join('') || '<div class="empty">No other games.</div>')}`;
  const w = $('#week'); if (w) w.onchange = (e) => { tick(); scoresWeek = e.target.value === w.dataset.cur ? '' : e.target.value; viewScores(); };
  view.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { tick(); scoresMode = b.dataset.mode; viewScores(true); }));
  scheduleRefresh(!scoresWeek && evs.some((e) => e.state === 'in'));
}
async function scoresGolf(quick) {
  if (!quick) paint(LT('Leaderboard', SK.sub()) + `<div class="toolbar sticky"><span class="sk w40 btnlike"></span></div>${SK.rows(14)}`);
  let gb; try { gb = await api(sbPath('golf'), 30e3); } catch (e) { view.innerHTML = LT('Leaderboard') + errBox(e); return; }
  const ts = gb.tournaments; if (!ts.find((t) => t.league === golfLeague) && ts[0]) golfLeague = ts[0].league;
  const t = ts.find((x) => x.league === golfLeague);
  if (!t) { view.innerHTML = LT('Leaderboard') + '<div class="card empty">No tournament this week.</div>'; return; }
  const ctx = castCtx(); const mf = muteFilter();
  const ps = t.players.filter((p) => !mf.teamId(p.id)); const hiddenN = t.players.length - ps.length;
  view.innerHTML = LT(esc(t.name), `${esc(t.detail || '')} · ${esc(t.course || '')}`) + `
    <div class="toolbar sticky"><div class="seg">${ts.map((x) => `<button data-gl="${x.league}" class="${x.league === golfLeague ? 'on' : ''}">${esc(x.tour)}</button>`).join('')}</div>
      <a class="btn" href="#/game/golf/${esc(t.id)}">Gamecast & scorecards ›</a></div>
    ${hiddenN ? `<div class="notice">${hiddenN} muted player(s) hidden</div>` : ''}
    <div class="card lb"><div class="lb-row hd"><span class="pos">Pos</span><span></span><span class="nm">Player</span><span class="tp">Total</span><span class="td">Today</span><span class="th">Thru</span></div>
    ${ps.map((p) => golfRow(p, ctx).replace('<button class="lb-row', `<a href="#/game/golf/${esc(t.id)}" data-open="${esc(p.id)}" class="lb-row`).replace(/<\/button>$/, '</a>')).join('')}</div>
    <p class="faint small">Tap a player for their scorecard. Cut line: ${t.cut && t.cut.score != null ? esc(t.cut.score) : 'n/a'}.</p>`;
  view.querySelectorAll('[data-gl]').forEach((b) => (b.onclick = () => { tick(); golfLeague = b.dataset.gl; viewScores(true); }));
  view.querySelectorAll('[data-open]').forEach((a) => (a.onclick = () => { castState.player = a.dataset.open; }));
  scheduleRefresh(t.state === 'in');
}
async function scoresTennis(quick) {
  if (!quick) paint(LT('Draws', SK.sub()) + `<div class="toolbar sticky"><span class="sk w40 btnlike"></span></div>${SK.games(6)}`);
  let tb; try { tb = await api(sbPath('tennis'), 30e3); } catch (e) { view.innerHTML = LT('Draws') + errBox(e); return; }
  const ts = tb.tournaments; if (!ts.length) { view.innerHTML = LT('Draws') + '<div class="card empty">No tournaments this week.</div>'; return; }
  let t = ts.find((x) => x.id === tennisT) || ts[0]; tennisT = t.id;
  if (!t.draws.includes(tennisDraw)) tennisDraw = t.draws.find((d) => /Singles/.test(d)) || t.draws[0];
  const ctx = castCtx(); const mf = muteFilter();
  const ms = t.matches.filter((m) => m.draw === tennisDraw && !mf.game(m));
  const rounds = []; for (const m of ms) { let r = rounds.find((x) => x.name === m.round); if (!r) rounds.push(r = { name: m.round, ms: [], last: 0 }); r.ms.push(m); r.last = Math.max(r.last, Date.parse(m.date)); }
  rounds.sort((a, b) => b.last - a.last);
  const ord = { in: 0, pre: 1, post: 2 };
  view.innerHTML = LT(esc(t.name), `${esc(t.tour)} · ${esc(t.venue || '')}`) + `
    <div class="toolbar sticky"><select class="btn" id="tt" aria-label="Tournament">${ts.map((x) => `<option value="${esc(x.id)}" ${x.id === t.id ? 'selected' : ''}>${esc(x.tour)} · ${esc(x.name)}</option>`).join('')}</select>
      <div class="seg">${t.draws.map((d) => `<button data-draw="${esc(d)}" class="${d === tennisDraw ? 'on' : ''}">${esc(d.replace("Men's ", 'M ').replace("Women's ", 'W '))}</button>`).join('')}</div></div>
    ${rounds.map((r) => `<h2>${esc(r.name)} <span class="count">${r.ms.length}</span></h2><div class="grid">${r.ms.sort((a, b) => ord[a.state] - ord[b.state] || Date.parse(a.date) - Date.parse(b.date)).map((m) => tennisMatch(m, ctx)).join('')}</div>`).join('') || '<div class="empty">No matches.</div>'}`;
  $('#tt').onchange = (e) => { tick(); tennisT = e.target.value; viewScores(true); };
  view.querySelectorAll('[data-draw]').forEach((b) => (b.onclick = () => { tick(); tennisDraw = b.dataset.draw; viewScores(true); }));
  scheduleRefresh(ms.some((m) => m.state === 'in'));
}

let newsMode = 'mine'; let newsQuery = ''; let newsLimit = 60;
async function viewNews() {
  setBar('News');
  const n = sportSources().filter((s) => sourceOn(s.id)).length;
  paint(LT('News', `Gathering headlines from ${n} sources…`) + `<div class="toolbar sticky"><span class="sk w50 btnlike"></span><span class="sk w30 btnlike"></span></div><h2><span class="sk w30 sm inline"></span></h2>${SK.news(3)}${SK.news(6)}`);
  let data;
  try { data = await api(newsPath(), 5 * 60e3); } catch (e) { view.innerHTML = LT('News') + errBox(e); return; }
  const render = () => {
    const { items, hidden } = filterNews(data.items);
    let list = newsMode === 'mine' && followsIn(S.sport).length ? items.filter((i) => i.mine.length) : items;
    if (newsQuery) { const q = newsQuery.toLowerCase(); list = list.filter((i) => (i.title + ' ' + i.summary + ' ' + i.source).toLowerCase().includes(q)); }
    const cl = topClusters(list, 6); const used = new Set(cl.flat().map((x) => x.link));
    const rest = list.filter((i) => !used.has(i.link));
    const failed = data.status.filter((s) => !s.ok);
    const outlets = new Set(list.map((i) => i.source)).size;
    $('#news-body').innerHTML = `${hiddenNotice(hidden)}
      ${cl.length ? `<h2>Same story, different sources <span class="count">${cl.length}</span></h2>${cl.map(clusterCard).join('')}` : ''}
      <h2>Latest <span class="count">${rest.length} headlines · ${outlets} outlets</span></h2>
      <div class="card panel news-list">${rest.slice(0, newsLimit).map(newsItem).join('') || '<div class="empty">Nothing matches. Try “All ${esc(SPI().short)}”, or loosen filters in Settings.</div>'}</div>
      ${rest.length > newsLimit ? '<p style="text-align:center"><button class="btn" id="more">Show more</button></p>' : ''}
      <p class="faint small">Updated ${timeAgo(data.fetchedAt)}${failed.length ? ` · ${failed.length} feed(s) unavailable: ${failed.map((f) => esc(f.id)).join(', ')}` : ''}. “Straight news” filtering is automatic and heuristic — tap any story to see how it was labeled.</p>`;
    const more = $('#more'); if (more) more.onclick = () => { newsLimit += 60; render(); };
  };
  view.innerHTML = LT(`${esc(SPI().short)} news`, 'Many outlets, side by side · your mutes applied everywhere') + `
    <div class="toolbar sticky"><input class="search" id="q" type="search" placeholder="Search headlines" value="${esc(newsQuery)}" autocomplete="off" />
      <div class="seg"><button data-nm="mine" class="${newsMode === 'mine' ? 'on' : ''}">My ${SPI().what}</button><button data-nm="all" class="${newsMode === 'all' ? 'on' : ''}">All ${esc(SPI().short)}</button></div>
      <label class="switch"><input type="checkbox" id="straight" ${S.straightOnly ? 'checked' : ''} />Straight only</label></div>
    <div id="news-body"></div>`;
  $('#q').oninput = (e) => { newsQuery = e.target.value; render(); };
  $('#straight').onchange = (e) => { tick(); S.straightOnly = e.target.checked; save(); render(); };
  view.querySelectorAll('[data-nm]').forEach((b) => (b.onclick = () => { tick(); newsMode = b.dataset.nm; view.querySelectorAll('[data-nm]').forEach((x) => x.classList.toggle('on', x === b)); render(); }));
  render();
}

function rankRow(r) {
  const t = r.team; const mine = S.follow.includes(t.id);
  const tr = r.trend && r.trend !== '-' ? r.trend : '';
  return `<a class="rank-row ${mine ? 'mine' : ''}" href="#/team/${t.id}"><span class="n">${r.rank}</span><img src="${esc(logo(t))}" alt="" loading="lazy" />
    <span><b>${esc(t.location)}</b> <span class="faint small">${esc(r.record || '')}</span></span>
    <span class="tr ${tr.startsWith('+') ? 'up' : tr.startsWith('-') ? 'down' : ''}">${tr ? (tr.startsWith('+') ? '▲' + tr.slice(1) : '▼' + tr.slice(1)) : '—'}</span>
    <span class="pts">${r.points ? `${r.points} pts` : ''}${r.fpv ? ` (${r.fpv})` : ''}</span></a>`;
}
let pollId = 'ap'; let tPoll = 'atp';
function standRow(r, sp, withDiv) {
  const t = r.team; const mine = S.follow.includes(t.id);
  return `<a class="st-row ${mine ? 'mine' : ''}" href="#/team/${t.id}"><img src="${esc(logo(t))}" alt="" loading="lazy" />
    <span class="nm"><b>${esc(t.short || t.location)}</b>${withDiv ? ` <span class="faint small">${esc(r.div)}</span>` : ''}${r.seed ? ` <span class="faint small">#${esc(r.seed)}</span>` : ''}</span>
    <span class="n">${esc(r.w)}-${esc(r.l)}${r.t && r.t !== '0' ? `-${esc(r.t)}` : ''}</span><span class="n">${esc(r.pct || '')}</span>
    <span class="n">${esc(sp === 'mlb' ? (r.gb || '') : (r.diff || ''))}</span><span class="n faint">${esc(r.streak || '')}</span></a>`;
}
async function viewRankings(quick) {
  const sp = S.sport; const lbl = SPI().tab4;
  setBar(lbl);
  if (!quick) paint(LT(lbl, SK.sub()) + `<div class="toolbar sticky"><span class="sk w40 btnlike"></span></div>${SK.rows(12)}`);
  let d; try { d = await api(`/api/rankings?sport=${sp}`, 10 * 60e3); } catch (e) { view.innerHTML = LT(lbl) + errBox(e); return; }
  const mf = muteFilter();
  if (sp === 'nfl' || sp === 'mlb') {
    let lg = [...new Set(d.groups.map((g) => g.league))];
    view.innerHTML = LT('Standings', `${sp === 'nfl' ? 'By division' : 'Regular season, by division'} · ESPN`) + lg.map((L) => `<h2>${esc(L)}</h2><div class="st-grid">${d.groups.filter((g) => g.league === L).map((g) => `<div class="card panel"><div class="st-row hd"><span></span><span class="nm">${esc(g.name)}</span><span class="n">W-L</span><span class="n">Pct</span><span class="n">${sp === 'mlb' ? 'GB' : 'Diff'}</span><span class="n">Strk</span></div>${g.rows.filter((r) => !mf.teamId(r.team.id)).map((r) => standRow(r, sp)).join('')}</div>`).join('')}</div>`).join('');
    return;
  }
  if (sp === 'golf') {
    const now = Date.now();
    const ev = (d.schedule || []).map((e) => ({ ...e, date: e.start, endDate: e.end, state: Date.parse(e.end) + 864e5 < now ? 'post' : Date.parse(e.start) <= now ? 'in' : 'pre' }));
    const row = (e) => `<div class="sched-row golf ${e.state === 'in' ? 'live' : ''}"><span class="faint small">${new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><span class="opp"><b>${esc(e.name)}</b>${e.major ? ' <span class="chip sm">Major</span>' : ''}</span><span class="small ${e.state === 'in' ? 'live' : 'faint'}">${e.state === 'in' ? 'LIVE' : e.state === 'post' ? 'Final' : ''}</span></div>`;
    const up = ev.filter((e) => Date.parse(e.endDate || e.date) >= now - 864e5); const past = ev.filter((e) => !up.includes(e)).reverse();
    view.innerHTML = LT('Schedule', 'PGA Tour season · ESPN') + `<div class="cols"><section><h2>Upcoming</h2><div class="card panel">${up.map(row).join('') || '<div class="empty">Season complete.</div>'}</div></section>
      <section><h2>Completed</h2><div class="card panel">${past.slice(0, 30).map(row).join('') || '<div class="empty">None yet.</div>'}</div></section></div>
      <p class="faint small">ESPN’s free data has no Official World Golf Ranking, so this tab shows the schedule.</p>`;
    return;
  }
  if (sp === 'tennis') {
    const poll = d.polls.find((p) => p.id === tPoll) || d.polls[0];
    view.innerHTML = LT('Rankings', `${esc(poll.name)}${poll.date ? ` · ${new Date(poll.date).toLocaleDateString()}` : ''}`) + `
      <div class="toolbar sticky"><div class="seg">${d.polls.map((p) => `<button data-tp="${p.id}" class="${p.id === poll.id ? 'on' : ''}">${esc(p.id.toUpperCase())}</button>`).join('')}</div></div>
      <div class="card panel">${poll.ranks.filter((r) => !mf.teamId(r.player.id)).map((r) => `<div class="rank-row ${follows(r.player.id) ? 'mine' : ''}"><span class="n">${r.rank}</span><img src="${esc(r.player.flag || '')}" alt="" class="flag" loading="lazy" />
        <span><b>${esc(r.player.name)}</b>${follows(r.player.id) ? ' <span class="star">●</span>' : ''}</span>${((mv) => `<span class="tr ${mv > 0 ? 'up' : mv < 0 ? 'down' : ''}">${mv ? (mv > 0 ? '▲' + mv : '▼' + -mv) : '—'}</span>`)(r.previous ? r.previous - r.rank : 0)}<span class="pts">${esc(r.points)} pts</span></div>`).join('')}</div>`;
    view.querySelectorAll('[data-tp]').forEach((b) => (b.onclick = () => { tick(); tPoll = b.dataset.tp; viewRankings(true); }));
    return;
  }
  const poll = d.polls.find((p) => p.id === pollId) || d.polls[0];
  const ranks = poll.ranks.filter((r) => !mf.teamId(r.team.id)); const hiddenN = poll.ranks.length - ranks.length;
  view.innerHTML = LT('Rankings', `${esc(poll.headline || poll.name)}${poll.date ? ` · ${new Date(poll.date).toLocaleDateString()}` : ''}`) + `
    <div class="toolbar sticky"><div class="seg">${d.polls.map((p) => `<button data-poll="${p.id}" class="${p.id === poll.id ? 'on' : ''}">${p.id === 'ap' ? 'AP Top 25' : p.id === 'usa' ? 'Coaches Poll' : esc(p.name)}</button>`).join('')}</div></div>
    ${hiddenN ? `<div class="notice">${hiddenN} muted team(s) hidden</div>` : ''}
    <div class="card panel">${ranks.map(rankRow).join('')}</div>
    ${poll.others.length ? `<h2>Others receiving votes</h2><p class="muted small">${poll.others.filter((o) => !mf.teamId(o.team.id)).map((o) => `<a href="#/team/${o.team.id}">${esc(o.team.location)}</a> ${o.points}`).join(' · ')}</p>` : ''}
    <p class="faint small">Points shown with first-place votes in parentheses. Source: ESPN public rankings data.</p>`;
  view.querySelectorAll('[data-poll]').forEach((b) => (b.onclick = () => { tick(); pollId = b.dataset.poll; viewRankings(true); }));
}

// ---------------- Gamecast ----------------
const castCtx = () => { const mf = muteFilter(); return { logo, follows, muted: (id) => mf.teamId(id) }; };
let castLive = false;
async function viewGame(sp, id, quick) {
  if (castState.sport !== sp || castState.id !== id) { const keep = castState.player; Object.assign(castState, { tab: 'summary', player: sp === 'golf' ? keep : null, sport: sp, id }); }
  setBar('Gamecast', { back: `#/${lastTab}` });
  if (!quick) paint(`<div class="card gc-head"><div class="sk w30 sm"></div><div class="sk w70"></div><div class="sk w50 sm"></div></div>${SK.games(1)}${SK.rows(8)}`);
  let d; try { d = await api(`/api/game/${sp}/${id}`, 10e3); } catch (e) { view.innerHTML = errBox(e); return; }
  if (!location.hash.startsWith(`#/game/${sp}/${id}`)) return;
  setBar(castTitle(d), { back: `#/${lastTab}` });
  const y = window.scrollY;
  view.innerHTML = `<div class="gc gc-${d.kind}">${renderGamecast(d, castCtx())}</div>`;
  if (quick) window.scrollTo(0, y);
  castLive = d.state === 'in';
  scheduleRefresh(castLive, 20e3);
}

async function viewTeam(id) {
  const meta = teamById(id) || {};
  setBar(meta.short || 'Team', { back: `#/${lastTab}` });
  paint(`<div class="card team-hero" style="--team:#${esc(meta.color || '1f6f5c')}">${meta.logo ? `<img src="${esc(logo(meta))}" alt="" />` : '<span class="sk logo big"></span>'}<div><h1>${esc(meta.name || '')}</h1><div class="sk w30 sm"></div></div></div>
    <h2>Record & scoring</h2><div class="kv">${rep(5, () => '<div class="card"><div class="sk w40"></div><div class="sk w70 sm"></div></div>')}</div>
    <div class="cols"><section><h2>Schedule</h2>${SK.rows(10)}</section><section><h2>Season stats</h2>${SK.news(3)}</section></div>`);
  let d; try { d = await api(`/api/team/${id}`, 2 * 60e3); } catch (e) { view.innerHTML = errBox(e); return; }
  const t = d.team;
  setBar(t.name, { back: `#/${lastTab}` });
  const following = S.follow.includes(t.id); const muted = S.muteTeams.includes(t.id);
  const sched = d.schedule.map((ev) => {
    const home = ev.home.team?.id === t.id; const me = home ? ev.home : ev.away; const opp = home ? ev.away : ev.home;
    let res = '';
    if (ev.state === 'post') res = `<span class="res ${me.winner ? 'W' : 'L'}">${me.winner ? 'W' : 'L'} ${esc(me.score)}–${esc(opp.score)}</span>`;
    else if (ev.state === 'in') res = `<span class="res" style="color:var(--live)">LIVE ${esc(me.score)}–${esc(opp.score)}</span>`;
    else res = `<span class="faint small">${/TBD/.test(ev.detail) ? 'TBD' : new Date(ev.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>`;
    return `<a class="sched-row" href="#/game/${meta.sport || 'cfb'}/${esc(ev.id)}"><span class="faint small">${new Date(ev.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
      <span class="opp"><span class="faint small">${home ? 'vs' : '@'}</span><img src="${esc(logo(opp.team))}" alt="" loading="lazy" />${opp.rank ? `<span class="faint small">${opp.rank}</span>` : ''}<span>${esc(opp.team?.short || 'TBD')}</span></span>${res}</a>`;
  }).join('');
  const recs = t.record.map((r) => `<div class="card"><div class="v">${esc(r.summary)}</div><div class="l">${esc(r.desc || r.name || 'Record')}</div></div>`).join('');
  view.innerHTML = `<div class="card team-hero" style="--team:#${esc(t.color || '1f6f5c')}"><img src="${esc(logo(t))}" alt="" />
      <div><h1>${esc(t.name)}</h1><div class="muted">${esc(t.standing || '')}${meta.conference ? ` · ${esc(meta.conference)}` : ''}</div></div>
      <div class="actions"><button class="btn ${following ? 'primary' : ''}" id="fol">${following ? '✓ Following' : '+ Follow'}</button><button class="btn ${muted ? 'danger' : ''}" id="mut">${muted ? 'Muted' : 'Mute'}</button></div></div>
    <h2>Record & scoring</h2><div class="kv">${recs}${meta.confRecord ? `<div class="card"><div class="v">${esc(meta.confRecord)}</div><div class="l">Conference</div></div>` : ''}
      ${t.ppg != null ? `<div class="card"><div class="v">${(+t.ppg).toFixed(1)}</div><div class="l">${meta.sport === 'mlb' ? 'Runs' : 'Points'} per game</div></div>` : ''}
      ${t.oppg != null ? `<div class="card"><div class="v">${(+t.oppg).toFixed(1)}</div><div class="l">${meta.sport === 'mlb' ? 'Runs' : 'Points'} allowed / game</div></div>` : ''}
      ${meta.streak ? `<div class="card"><div class="v">${esc(meta.streak)}</div><div class="l">Streak</div></div>` : ''}</div>
    <div class="cols"><section><h2>Schedule</h2><div class="card panel">${sched || '<div class="empty">No schedule.</div>'}</div></section>
    <section><h2>Season stats</h2><div class="stat-groups">${d.stats.map((g) => `<div class="card"><h4>${esc(g.name)}</h4>${g.items.map((s) => `<div class="r"><span>${esc(s.label)}</span><b>${esc(s.value)}</b></div>`).join('')}</div>`).join('') || `<div class="empty">${meta.sport === 'mlb' ? 'Season stats aren’t in ESPN’s free MLB team feed.' : 'No stats yet.'}</div>`}</div>
    <h2>Latest news</h2><div id="team-news">${SK.news(4)}</div></section></div>`;
  $('#fol').onclick = () => { tick(); S.follow = following ? S.follow.filter((x) => x !== t.id) : [...S.follow, t.id]; if (!following) S.muteTeams = S.muteTeams.filter((x) => x !== t.id); save(); toast(following ? `Unfollowed ${t.name}` : `Following ${t.name}`); SILENT = true; viewTeam(id).finally(() => (SILENT = false)); };
  $('#mut').onclick = () => { tick(); S.muteTeams = muted ? S.muteTeams.filter((x) => x !== t.id) : [...S.muteTeams, t.id]; if (!muted) S.follow = S.follow.filter((x) => x !== t.id); save(); toast(muted ? `Unmuted ${t.name}` : `Muted ${t.name}`); SILENT = true; viewTeam(id).finally(() => (SILENT = false)); };
  try {
    const n = await api(newsPath(t.id, meta.sport || 'cfb'), 5 * 60e3);
    const m = teamMatcher(meta.id ? meta : t, TEAMS, meta.sport || 'cfb');
    const { items } = filterNews(n.items);
    const mine = items.filter((i) => m(itemText(i))).slice(0, 15);
    $('#team-news').innerHTML = `<div class="card panel news-list">${mine.map(newsItem).join('') || `<div class="empty">${muted ? 'This team is muted, so its news is hidden.' : 'No recent straight-news stories.'}</div>`}</div>`;
  } catch (e) { $('#team-news').innerHTML = errBox(e); }
}

// ---------------- preference pickers (shared by onboarding + settings sub-screens) ----------------
let teamQ = ''; let teamConf = ''; let muteQ = ''; let pickSport = null;
const pSport = () => (pickSport && S.sports.includes(pickSport) ? pickSport : (pickSport = S.sports[0] || 'cfb'));
const UTAH = () => ['BYU', 'Utah', 'Utah State'].map((l) => TEAMS_BY.cfb.find((t) => t.location === l)).filter(Boolean);
async function loadPlayers(sp, root) {
  if (PLAYERS_BY[sp] || loadPlayers[sp]) return; loadPlayers[sp] = 1;
  try { PLAYERS_BY[sp] = await api(`/api/players/${sp}`, 36e5); } catch { PLAYERS_BY[sp] = []; }
  loadPlayers[sp] = 0; if (root) refreshParts(root, []);
}
const KW_SUGGEST = ['NBA', 'WNBA', 'LeBron', 'Caitlin Clark'];
const OUTLET_SUGGEST = ['ESPN', 'Bleacher Report', 'Barstool', 'OutKick'];
const CHECK = '<span class="check" aria-hidden="true"></span>';
const mascot = (t) => (t.name.startsWith(t.location) ? t.name.slice(t.location.length).trim() : t.name);

function partHTML(p) {
  const f = (id) => S.follow.includes(id);
  switch (p) {
    case 'sportseg': return S.sports.length > 1 ? `<div class="chips sport-chips">${S.sports.map((k) => `<button class="chip lg ${k === pSport() ? 'on' : ''}" data-psport="${k}">${SPORTS[k].emoji} ${esc(SPORTS[k].short)}<span class="cnt">${followsIn(k).length || ''}</span></button>`).join('')}</div>` : '';
    case 'sports': return SPORT_IDS.map((k) => { const on = S.sports.includes(k); const v = SPORTS[k]; return `<button class="tile sport ${on ? 'on' : ''}" data-sport="${k}" aria-pressed="${on}"><span class="em">${v.emoji}</span><span><b>${esc(v.name)}</b><small>${esc(v.blurb || '')}</small></span>${CHECK}</button>`; }).join('');
    case 'quicklbl': return pSport() === 'cfb' && UTAH().length ? 'Popular in Utah' : '';
    case 'quick': if (pSport() !== 'cfb') return ''; return UTAH().map((t) => `<button class="chip lg ${f(t.id) ? 'on' : ''}" data-tfollow="${t.id}" aria-pressed="${f(t.id)}"><img src="${esc(logo(t))}" alt="" />${esc(t.short)}${f(t.id) ? ' ✓' : ''}</button>`).join('');
    case 'followed': {
      const sp = pSport(); const l = followsIn(sp).map(teamById).filter(Boolean);
      return l.length ? l.map((t) => `<button class="chip on" data-tfollow="${t.id}"><img src="${esc(logo(t))}" alt="" class="${t.player ? 'flag' : ''}" />${esc(t.short)} <span class="x">✕</span></button>`).join('') : `<span class="faint small">None yet — that’s fine, you’ll see ${sp === 'cfb' ? 'all of FBS' : `all of ${esc(SPORTS[sp].short)}`}.</span>`;
    }
    case 'followcount': { const n = followsIn(pSport()).length; return n ? `· ${n}` : ''; }
    case 'tsearch': { const sp = pSport(); const n = teamSport(sp) ? TEAMS_BY[sp].length : (PLAYERS_BY[sp] || []).length;
      return `<input class="search" data-in="tsearch" type="search" placeholder="Search ${n || ''} ${teamSport(sp) ? 'teams' : 'players'}" value="${esc(teamQ)}" autocomplete="off" enterkeyhint="search" />${teamSport(sp) ? confSelect() : ''}`; }
    case 'grid': {
      const sp = pSport(); const q = teamQ.trim().toLowerCase();
      if (!teamSport(sp)) {
        if (!PLAYERS_BY[sp]) { loadPlayers(sp, document.querySelector('#onb') || view); return '<div class="empty">Loading players…</div>'; }
        const list = PLAYERS_BY[sp].filter((p) => !q || `${p.name} ${p.country}`.toLowerCase().includes(q));
        const show = q ? list.slice(0, 120) : list.slice(0, 60);
        return show.map((p) => `<button class="pick-row ${f(p.id) ? 'on' : ''}" data-tfollow="${p.id}" data-pname="${esc(p.name)}" data-pflag="${esc(p.flag || '')}" aria-pressed="${f(p.id)}"><img src="${esc(p.flag || '')}" alt="" class="flag" loading="lazy" /><span class="nm"><b>${esc(p.name)}</b><small>${esc(p.tour || '')}${p.rank ? ` · No. ${p.rank}` : ''}${p.country ? ` · ${esc(p.country)}` : ''}</small></span>${CHECK}</button>`).join('')
          + (list.length > show.length ? `<div class="empty small">Showing ${show.length} of ${list.length} — search to find more.</div>` : '') || '<div class="empty">No players match.</div>';
      }
      const TL = TEAMS_BY[sp];
      const list = TL.filter((t) => (!teamConf || t.conferenceId === teamConf) && (!q || `${t.name} ${t.abbr} ${t.conference}`.toLowerCase().includes(q)));
      return list.map((t) => `<button class="pick-row ${f(t.id) ? 'on' : ''}" data-tfollow="${t.id}" aria-pressed="${f(t.id)}"><img src="${esc(logo(t))}" alt="" loading="lazy" /><span class="nm"><b>${esc(t.short)}</b><small>${sp === 'cfb' ? `${esc(mascot(t))} · ` : ''}${esc(t.conference)}</small></span>${CHECK}</button>`).join('') || '<div class="empty">No teams match.</div>';
    }
    case 'confs': return CONFS.map((c) => {
      const n = TEAMS.filter((t) => t.conferenceId === c.id).length; const on = S.conferences.includes(c.id);
      return `<button class="tile ${on ? 'on' : ''}" data-conf="${c.id}" aria-pressed="${on}"><span><b>${esc(c.short)}</b><small>${n} teams</small></span>${CHECK}</button>`;
    }).join('');
    case 'leagues': return Object.entries(LEAGUE_MUTES).map(([k, v]) => { const on = S.muteLeagues.includes(k); return `<button class="chip lg mute ${on ? 'on' : ''}" data-league="${k}" aria-pressed="${on}" title="Hides: ${esc(v.words.join(', '))}">${on ? '🔇 ' : ''}${esc(v.label)}</button>`; }).join('');
    case 'kws': return [...S.muteKeywords.map((k) => `<button class="chip lg mute on" data-unkw="${esc(k)}">${esc(k)} <span class="x">✕</span></button>`),
      ...KW_SUGGEST.filter((k) => !S.muteKeywords.some((x) => x.toLowerCase() === k.toLowerCase())).map((k) => `<button class="chip lg ghost" data-addkw="${esc(k)}">+ ${esc(k)}</button>`)].join('');
    case 'mteams': { const l = S.muteTeams.map(teamById).filter(Boolean); return l.map((t) => `<button class="chip lg mute on" data-unmute="${t.id}"><img src="${esc(logo(t))}" alt="" class="${t.player ? 'flag' : ''}" />${esc(t.short)}<small>${esc(SPORTS[t.sport || 'cfb'].short)}</small> <span class="x">✕</span></button>`).join('') || '<span class="faint small">No teams or players muted.</span>'; }
    case 'mresults': {
      const q = muteQ.trim().toLowerCase(); if (q.length < 2) return '';
      S.sports.filter((k) => !teamSport(k)).forEach((k) => loadPlayers(k, document.querySelector('#onb') || view));
      const pool = [...TEAMS.filter((t) => S.sports.includes(t.sport)), ...S.sports.filter((k) => !teamSport(k)).flatMap((k) => (PLAYERS_BY[k] || []).map((p) => ({ ...p, short: p.name, logo: p.flag, logoDark: p.flag, player: true })))];
      return pool.filter((t) => t.name.toLowerCase().includes(q) && !S.muteTeams.includes(t.id)).slice(0, 10).map((t) => `<button class="chip lg" data-mute="${t.id}" ${t.player ? `data-pname="${esc(t.name)}" data-pflag="${esc(t.flag || '')}"` : ''}><img src="${esc(logo(t))}" alt="" class="${t.player ? 'flag' : ''}" />Mute ${esc(t.short)}<small>${esc(SPORTS[t.sport].short)}</small></button>`).join('') || '<span class="faint small">No match.</span>';
    }
    case 'outlets': { const b = S.blockOutlets || []; return [...b.map((x) => `<button class="chip lg mute on" data-unblock="${esc(x)}">🚫 ${esc(x)} <span class="x">✕</span></button>`), ...OUTLET_SUGGEST.filter((x) => !b.includes(x)).map((x) => `<button class="chip lg ghost" data-block="${esc(x)}">+ ${esc(x)}</button>`)].join(''); }
    case 'sources': return S.sports.map((k) => `<div class="group-lbl">${SPORTS[k].emoji} ${esc(SPORTS[k].name)}</div><div class="list card">${sportSources(k).map((s) => `<label class="row"><span class="rt"><b>${esc(s.name)}</b><small>${esc(s.kind)}${s.via ? ` · via ${esc(s.via)}` : ''}</small></span><span class="switch"><input type="checkbox" data-src="${s.id}" ${sourceOn(s.id) ? 'checked' : ''} /></span></label>`).join('')}</div>`).join('');
    case 'theme': return ['system', 'light', 'dark'].map((m) => `<button class="row radio ${S.theme === m ? 'on' : ''}" data-theme="${m}"><span class="rt"><b>${cap(m)}</b><small>${m === 'system' ? 'Match your device' : m === 'light' ? 'Always light' : 'Always dark'}</small></span>${CHECK}</button>`).join('');
    case 'summary': {
      const teams = S.follow.map(teamById).filter(Boolean).filter((t) => S.sports.includes(t.sport || 'cfb')); const confs = S.conferences.map((id) => CONFS.find((c) => c.id === id)).filter(Boolean);
      const mutes = activeMutes(); const bl = S.blockOutlets || [];
      return `<div class="list card summary">
        <div class="row"><span class="rt"><b>Sports</b><small>${S.sports.map((k) => `${SPORTS[k].emoji} ${esc(SPORTS[k].short)}`).join(' · ')}</small></span></div>
        <div class="row"><span class="rt"><b>Following</b><small>${teams.length ? teams.map((t) => esc(t.short)).join(', ') : 'Nobody yet — showing everything'}</small></span><span class="logos">${teams.slice(0, 4).map((t) => `<img src="${esc(logo(t))}" alt="" />`).join('')}</span></div>
        ${S.sports.includes('cfb') ? `<div class="row"><span class="rt"><b>CFB conferences</b><small>${confs.length ? confs.map((c) => esc(c.short)).join(', ') : 'All FBS'}</small></span></div>` : ''}
        <div class="row"><span class="rt"><b>Muted</b><small>${mutes.length ? mutes.map(esc).join(', ') : 'Nothing'}</small></span></div>
        <div class="row"><span class="rt"><b>Blocked outlets</b><small>${bl.length ? bl.map(esc).join(', ') : 'None'}</small></span></div>
        <div class="row"><span class="rt"><b>Straight news only</b><small>${S.straightOnly ? 'On — opinion, picks & betting hidden' : 'Off'}</small></span></div></div>`;
    }
    default: return '';
  }
}
function refreshParts(root, skip = []) {
  root.querySelectorAll('[data-part]').forEach((el) => {
    const p = el.dataset.part; if (skip.includes(p)) return;
    if (p === 'tsearch' && el.contains(document.activeElement)) return; // don't steal focus while typing
    el.innerHTML = partHTML(p);
  });
}
function prefClick(e, root) {
  const b = e.target.closest('[data-tfollow],[data-sport],[data-psport],[data-conf],[data-league],[data-unkw],[data-addkw],[data-unmute],[data-mute],[data-block],[data-unblock],[data-theme]');
  if (!b || !root.contains(b)) return false;
  e.preventDefault(); tick();
  const d = b.dataset; let skip = [];
  if (d.pname && (d.tfollow || d.mute)) rememberPlayer(d.tfollow || d.mute, d.pname, d.pflag);
  if (d.sport) {
    const on = S.sports.includes(d.sport);
    if (on && S.sports.length === 1) { toast('Keep at least one sport'); return true; }
    S.sports = on ? S.sports.filter((x) => x !== d.sport) : SPORT_IDS.filter((x) => x === d.sport || S.sports.includes(x));
    if (!S.sports.includes(S.sport)) S.sport = S.sports[0];
    pickSport = on ? null : d.sport; teamQ = ''; teamConf = '';
    syncSportUI();
  } else if (d.psport) { pickSport = d.psport; teamQ = ''; teamConf = ''; }
  else if (d.tfollow) {
    S.follow = toggle(S.follow, d.tfollow); S.muteTeams = S.muteTeams.filter((x) => !S.follow.includes(x));
    const on = S.follow.includes(d.tfollow);
    root.querySelectorAll(`.pick-row[data-tfollow="${d.tfollow}"]`).forEach((el) => { el.classList.toggle('on', on); el.setAttribute('aria-pressed', on); });
    skip = ['grid'];
  } else if (d.conf) S.conferences = toggle(S.conferences, d.conf);
  else if (d.league) S.muteLeagues = toggle(S.muteLeagues, d.league);
  else if (d.unkw) S.muteKeywords = S.muteKeywords.filter((x) => x !== d.unkw);
  else if (d.addkw) S.muteKeywords = [...new Set([...S.muteKeywords, d.addkw])];
  else if (d.unmute) S.muteTeams = S.muteTeams.filter((x) => x !== d.unmute);
  else if (d.mute) { S.muteTeams = [...new Set([...S.muteTeams, d.mute])]; S.follow = S.follow.filter((x) => x !== d.mute); }
  else if (d.block) S.blockOutlets = [...new Set([...(S.blockOutlets || []), d.block])];
  else if (d.unblock) S.blockOutlets = (S.blockOutlets || []).filter((x) => x !== d.unblock);
  else if (d.theme) { S.theme = d.theme; applyTheme(); }
  save(); refreshParts(root, skip);
  return true;
}
function prefInput(e, root) {
  const k = e.target.dataset.in;
  if (k === 'tsearch') { teamQ = e.target.value; const g = $('[data-part="grid"]', root); if (g) { g.innerHTML = partHTML('grid'); g.scrollTop = 0; } }
  else if (k === 'mutesearch') { muteQ = e.target.value; const g = $('[data-part="mresults"]', root); if (g) g.innerHTML = partHTML('mresults'); }
}
function prefChange(e, root) {
  const el = e.target;
  if (el.dataset.in === 'tconf') { teamConf = el.value; const g = $('[data-part="grid"]', root); if (g) g.innerHTML = partHTML('grid'); }
  else if (el.dataset.src) { tick(); S.sources[el.dataset.src] = el.checked; save(); }
  else if (el.dataset.flag) { tick(); S[el.dataset.flag] = el.checked; save(); refreshParts(root); }
}
function prefSubmit(e, root) {
  const form = e.target.closest('[data-form]'); if (!form) return;
  e.preventDefault(); const input = $('input', form); const v = input.value.split(',').map((x) => x.trim()).filter(Boolean);
  if (!v.length) return;
  tick();
  if (form.dataset.form === 'kw') S.muteKeywords = [...new Set([...S.muteKeywords, ...v])];
  if (form.dataset.form === 'block') S.blockOutlets = [...new Set([...(S.blockOutlets || []), ...v])];
  input.value = ''; save(); refreshParts(root);
}
function bindPrefs(root) {
  root.onclick = (e) => prefClick(e, root); root.oninput = (e) => prefInput(e, root);
  root.onchange = (e) => prefChange(e, root); root.onsubmit = (e) => prefSubmit(e, root);
}
const confSelect = () => `<select class="btn" data-in="tconf" aria-label="${pSport() === 'cfb' ? 'Conference' : 'Division'}"><option value="">All ${pSport() === 'cfb' ? 'conferences' : 'divisions'}</option>${DIVS_BY[pSport()].map((c) => `<option value="${c.id}" ${teamConf === c.id ? 'selected' : ''}>${esc(c.short)}</option>`).join('')}</select>`;
const flagSwitch = (flag, title, sub) => `<label class="row"><span class="rt"><b>${title}</b><small>${sub}</small></span><span class="switch"><input type="checkbox" data-flag="${flag}" ${S[flag] ? 'checked' : ''} /></span></label>`;
const P = {
  teams: () => `<div data-part="sportseg"></div><div class="lbl" data-part="quicklbl"></div><div class="chips" data-part="quick"></div>
    <div class="lbl">Following <span data-part="followcount"></span></div><div class="chips" data-part="followed"></div>
    <div class="search-wrap" data-part="tsearch"></div>
    <div class="pick-list card" data-part="grid"></div>`,
  confs: () => '<div class="tiles" data-part="confs"></div>',
  sports: () => '<div class="tiles sports" data-part="sports"></div>',
  mute: (full) => `<div class="lbl">Leagues & topics</div><div class="chips" data-part="leagues"></div>
    <div class="lbl">Keywords <span class="faint">· whole word, any case</span></div><div class="chips" data-part="kws"></div>
    <form class="kw-form" data-form="kw"><input placeholder="Add a keyword, e.g. Deion" autocomplete="off" enterkeyhint="done" /><button class="btn">Mute</button></form>
    ${full ? `<div class="lbl">Teams & players</div><div class="chips" data-part="mteams"></div><div class="kw-form"><input data-in="mutesearch" placeholder="Type a team or player to mute…" autocomplete="off" /></div><div class="chips" data-part="mresults" style="margin-top:8px"></div>
    <div class="list card" style="margin-top:18px">${flagSwitch('sportOnly', 'This sport only', 'Hide other sports from school, team & local feeds')}</div>` : ''}`,
  outlets: () => `<div class="lbl">Block outlets <span class="faint">· also removes them from Google News results</span></div><div class="chips" data-part="outlets"></div>
    <form class="kw-form" data-form="block"><input placeholder="Outlet name, e.g. TMZ" autocomplete="off" enterkeyhint="done" /><button class="btn">Block</button></form>`,
};

// ---------------- settings (grouped list → sub-screens) ----------------
const IC = {
  team: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/>',
  conf: '<rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  mute: '<path d="M11 5L6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6"/>',
  src: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 13h7"/>',
  straight: '<path d="M4 6h16M4 12h10M4 18h7"/>',
  sports: '<circle cx="12" cy="12" r="9"/><path d="M3.5 9.5c5 1 12 1 17 0M3.5 14.5c5-1 12-1 17 0M12 3v18"/>',
  ball: '<ellipse cx="12" cy="12" rx="9" ry="5.5" transform="rotate(-35 12 12)"/><path d="M9 15l6-6M10.5 11l2.5 2.5"/>',
  moon: '<path d="M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10z"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  block: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
};
const icon = (k, c) => `<span class="ic" style="--c:${c}"><svg viewBox="0 0 24 24">${IC[k]}</svg></span>`;
const linkRow = (href, k, c, title, sub) => `<a class="row" href="${href}">${icon(k, c)}<span class="rt"><b>${title}</b><small>${esc(sub)}</small></span><span class="chev">›</span></a>`;
const iconFlag = (flag, k, c, title, sub) => `<label class="row">${icon(k, c)}<span class="rt"><b>${title}</b><small>${sub}</small></span><span class="switch"><input type="checkbox" data-flag="${flag}" ${S[flag] ? 'checked' : ''} /></span></label>`;

function viewSettings(sub) {
  if (sub) return viewSettingsSub(sub);
  setBar('Settings');
  const teamsTxt = S.follow.map(teamById).filter((t) => t && S.sports.includes(t.sport || 'cfb')).map((t) => t.short).join(', ') || 'Nobody yet — showing everything';
  const confTxt = S.conferences.map((id) => CONFS.find((c) => c.id === id)?.short).filter(Boolean).join(', ') || 'All FBS';
  const mutes = activeMutes(); const mySrc = SOURCES.filter((s) => S.sports.includes(s.sport)); const onCount = mySrc.filter((s) => sourceOn(s.id)).length; const bl = S.blockOutlets || [];
  view.innerHTML = LT('Settings', 'Saved on this device only') + `
    <div class="group-lbl">Your feed</div><div class="list card">
      ${linkRow('#/settings/sports', 'sports', '#d26a1b', 'Sports', S.sports.map((k) => SPORTS[k].short).join(', '))}
      ${linkRow('#/settings/teams', 'team', '#1f6f5c', 'Teams & players', teamsTxt)}
      ${S.sports.includes('cfb') ? linkRow('#/settings/conferences', 'conf', '#3b6fd8', 'CFB conferences', confTxt) : ''}</div>
    <div class="group-lbl">Filters</div><div class="list card">
      ${linkRow('#/settings/mute', 'mute', '#c2332b', 'Mute', mutes.length ? mutes.join(', ') : 'Nothing muted')}
      ${linkRow('#/settings/sources', 'src', '#b26a00', 'News sources', `${onCount} of ${mySrc.length} on${bl.length ? ` · ${bl.length} blocked` : ''}`)}
      ${iconFlag('straightOnly', 'straight', '#6b4fd8', 'Straight news only', 'Hide opinion, picks, betting & podcasts')}
      ${iconFlag('sportOnly', 'ball', '#2f8f4e', 'This sport only', 'Hide other sports from school, team & local feeds')}</div>
    <div class="group-lbl">App</div><div class="list card">
      ${linkRow('#/settings/appearance', 'moon', '#44505e', 'Appearance', cap(S.theme))}
      <button class="row" data-act="tour">${icon('spark', '#1f6f5c')}<span class="rt"><b>Replay welcome tour</b><small>Step through setup again</small></span><span class="chev">›</span></button>
      ${linkRow('#/settings/about', 'info', '#3b6fd8', 'About & install', 'How filtering works · data sources')}</div>
    <div class="list card" style="margin-top:22px"><button class="row danger" data-act="reset"><span class="rt"><b>Reset all settings</b></span></button></div>
    <p class="faint small center">Straight Sports · prototype · no ads, no accounts</p>`;
  view.onclick = (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return; tick();
    if (b.dataset.act === 'tour') openOnboarding(1);
    if (b.dataset.act === 'reset' && confirm('Reset all settings on this device?')) { S = structuredClone(DEFAULTS); save(); applyTheme(); syncSportUI(); openOnboarding(0); viewSettings(); }
  };
  view.onchange = (e) => prefChange(e, view);
}
function viewSettingsSub(sub) {
  const back = { back: '#/settings' };
  const screens = {
    sports: ['Sports', 'Pick the sports you want. Switch between them with the chips at the top of each tab.', P.sports()],
    teams: ['Teams & players', 'Their games and news always come first.', P.teams()],
    conferences: ['CFB conferences', 'Shown after your teams in Scores and News. Pick none to see all of FBS.', P.confs()],
    mute: ['Mute', 'Muted things are removed everywhere, in every sport: scores, leaderboards, rankings, news and story groups.', P.mute(true)],
    sources: ['News sources', 'Mix wire services, national, local and official team outlets.', `<div class="list card">${flagSwitch('straightOnly', 'Straight news only', 'Hide opinion, picks, betting & podcasts')}</div><div class="group-lbl">Outlets</div><div class="list card" data-part="sources"></div>${P.outlets()}`],
    appearance: ['Appearance', '', '<div class="list card" data-part="theme"></div>'],
    about: ['About & install', '', `<div class="card prose">
      <h3>Install it like an app</h3><p><b>iPhone:</b> Safari → Share → “Add to Home Screen”.<br/><b>Android / Chrome / Edge:</b> menu → “Install app”.</p>
      <h3>How “straight news” works</h3><p>Headlines are labeled automatically with keyword and URL rules (e.g. “column”, “hot take”, “predictions”, “odds”, question headlines). It’s a heuristic, not a bias rating — tap any story to see why it was labeled.</p>
      <h3>Data</h3><p>Scores, schedules, leaderboards, rankings, standings and Gamecast data come from ESPN’s public JSON. Headlines come from RSS feeds (AP, Reuters, CBS, Yahoo, NYT, The Guardian, PGA Tour, LPGA, ATP, WTA, NCAA.com, Deseret News, Salt Lake Tribune, KSL and more) and Google News. NBA and WNBA are never shown. No tracking, no ads; settings stay on this device.</p>
      <h3>Gamecast limits</h3><p>Football: the field is schematic and win probability is ESPN’s model. Baseball: runners and the count are shown only while a game is live. Golf: hole-by-hole scorecards, no shot tracking or world ranking. Tennis: set scores and server only, no point-by-point or match stats.</p></div>`],
  };
  const s = screens[sub]; if (!s) { location.hash = '#/settings'; return; }
  setBar(s[0], back);
  view.innerHTML = LT(s[0], s[1]) + `<div class="sub-screen">${s[2]}</div>`;
  refreshParts(view); bindPrefs(view);
}

// ---------------- onboarding (paged, swipeable) ----------------
const STEPS = 6; const CONF_STEP = 3;
function openOnboarding(start = 0) {
  if ($('#onb')) return;
  teamQ = ''; teamConf = '';
  const el = document.createElement('div'); el.id = 'onb'; el.className = 'onb'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Welcome to Straight Sports');
  el.innerHTML = `<div class="onb-frame">
    <div class="onb-top"><button class="onb-link" data-nav="back"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>Back</button>
      <div class="dots">${rep(STEPS, (i) => `<button class="dot" data-go="${i}" aria-label="Step ${i + 1}"></button>`)}</div>
      <button class="onb-link" data-nav="skip">Skip</button></div>
    <div class="onb-viewport"><div class="onb-track">
      <section class="slide s-welcome"><div class="hero-logo"><img src="/icons/icon.svg" alt="" /></div>
        <h1>Straight<b>Sports</b></h1><p class="pitch">College football, NFL, MLB, golf and tennis: scores and headlines from many outlets, without the hot takes, ads, or NBA news you didn’t ask for.</p>
        <ul class="feat"><li><span class="fi">🏈</span><div><b>Your teams and players first</b><small>Games, Gamecast, leaderboards and news for who you pick.</small></div></li>
          <li><span class="fi">📰</span><div><b>Many sources, side by side</b><small>See how different outlets cover the same story.</small></div></li>
          <li><span class="fi">🔇</span><div><b>Mute anything</b><small>Leagues, teams, keywords or whole outlets.</small></div></li></ul>
        <p class="kbd-hint">Tip: use ← → keys to move between steps</p></section>
      <section class="slide"><div class="step-k">Step 1 of 4</div><h2 class="st">Pick your sports</h2><p class="help">Choose one or more. You can switch between them anytime.</p>${P.sports()}</section>
      <section class="slide"><div class="step-k">Step 2 of 4</div><h2 class="st">Pick teams & players</h2><p class="help">Their games and news always come first.</p>${P.teams()}</section>
      <section class="slide"><div class="step-k">CFB · optional</div><h2 class="st">Pick conferences</h2><p class="help">Their scores and news show after your teams. Pick none to see all of FBS.</p>${P.confs()}</section>
      <section class="slide"><div class="step-k">Step 3 of 4</div><h2 class="st">Mute what you don’t want</h2><p class="help">Muted things disappear everywhere, in every sport.</p>${P.mute(false)}${P.outlets()}
        <div class="list card" style="margin-top:16px">${flagSwitch('straightOnly', 'Straight news only', 'Hide opinion, hot takes, picks & betting')}</div></section>
      <section class="slide s-done"><div class="step-k">Step 4 of 4</div><div class="done-mark"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><h2 class="st">You’re all set</h2><p class="help">Here’s your feed. Change any of it later in Settings.</p><div data-part="summary"></div></section>
    </div></div>
    <div class="onb-bottom"><button class="btn primary xl" data-nav="next">Get started</button></div></div>`;
  document.body.appendChild(el); document.body.classList.add('onb-open');
  refreshParts(el);
  const track = $('.onb-track', el); const slides = [...el.querySelectorAll('.slide')]; const next = $('[data-nav="next"]', el);
  let i = 0;
  const sync = () => {
    el.querySelectorAll('.dot').forEach((d, k) => { d.classList.toggle('on', k === i); d.classList.toggle('done', k < i); if (k === i) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current'); });
    $('[data-nav="back"]', el).style.visibility = i ? 'visible' : 'hidden';
    $('[data-nav="skip"]', el).style.visibility = i < STEPS - 1 ? 'visible' : 'hidden';
    next.textContent = i === 0 ? 'Get started' : i === STEPS - 1 ? 'Show my feed' : (i === 2 && !S.follow.length) || (i === CONF_STEP && !S.conferences.length) ? 'Skip this step' : 'Next';
    el.querySelectorAll('.dot')[CONF_STEP].hidden = !S.sports.includes('cfb');
  };
  const go = (n) => {
    if (n === CONF_STEP && !S.sports.includes('cfb')) n += n > i ? 1 : -1; // conferences only matter for CFB
    i = Math.max(0, Math.min(STEPS - 1, n));
    track.style.transition = ''; track.style.transform = `translateX(${-i * 100}%)`;
    slides.forEach((s, k) => { s.inert = k !== i; });
    if (i === STEPS - 1 || i === 2) refreshParts(el, i === 2 ? [] : ['grid']);
    sync();
  };
  const finish = () => {
    tick(); S.onboarded = true; save(); document.removeEventListener('keydown', onKey);
    el.classList.add('closing'); setTimeout(() => { el.remove(); document.body.classList.remove('onb-open'); }, 320);
    if (location.hash !== '#/home') location.hash = '#/home'; else route();
  };
  let suppress = false;
  el.addEventListener('click', (e) => {
    if (suppress) { e.preventDefault(); e.stopPropagation(); return; }
    const nav = e.target.closest('[data-nav]'); const dot = e.target.closest('[data-go]');
    if (nav) { tick(); const a = nav.dataset.nav; if (a === 'back') go(i - 1); else if (a === 'skip' || i === STEPS - 1) finish(); else go(i + 1); return; }
    if (dot) { tick(); go(+dot.dataset.go); return; }
    if (prefClick(e, el)) sync();
  });
  el.addEventListener('input', (e) => prefInput(e, el));
  el.addEventListener('change', (e) => { prefChange(e, el); sync(); });
  el.addEventListener('submit', (e) => prefSubmit(e, el));
  // keyboard (desktop)
  const onKey = (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); } else if (e.key === 'Enter' && i === STEPS - 1) finish();
  };
  document.addEventListener('keydown', onKey);
  // swipe (touch): horizontal drags page between steps; vertical drags still scroll the slide
  const vp = $('.onb-viewport', el); let sx = null; let sy = 0; let dx = 0; let drag = false;
  vp.addEventListener('scroll', () => { vp.scrollLeft = 0; }); // never let focus/scrollIntoView shift the pager
  vp.addEventListener('touchstart', (e) => { if (e.touches.length !== 1) { sx = null; return; } sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; drag = false; }, { passive: true });
  vp.addEventListener('touchmove', (e) => {
    if (sx == null) return; const t = e.touches[0]; const mx = t.clientX - sx; const my = t.clientY - sy;
    if (!drag) { if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.2) { drag = true; track.style.transition = 'none'; } else if (Math.abs(my) > 12) { sx = null; return; } else return; }
    e.preventDefault(); dx = mx; const edge = (i === 0 && dx > 0) || (i === STEPS - 1 && dx < 0);
    track.style.transform = `translateX(calc(${-i * 100}% + ${edge ? dx / 3 : dx}px))`;
  }, { passive: false });
  const end = () => {
    if (sx == null) return; sx = null; if (!drag) return; drag = false; track.style.transition = '';
    const w = vp.clientWidth; if (dx < -w * 0.18) go(i + 1); else if (dx > w * 0.18) go(i - 1); else go(i);
    suppress = true; setTimeout(() => (suppress = false), 350);
  };
  vp.addEventListener('touchend', end); vp.addEventListener('touchcancel', end);
  track.style.transition = 'none'; go(start); requestAnimationFrame(() => (track.style.transition = ''));
}

// ---------------- story sheet ----------------
function alsoCovered(it) {
  const g = GROUPS.get(it.link); if (g) return g.filter((x) => x.link !== it.link);
  const tk = tokens(it.title); const seen = new Set([it.source]); const out = [];
  for (const x of POOL) { if (out.length >= 5) break; if (seen.has(x.source) || x.link === it.link) continue; if (similar(tk, tokens(x.title))) { seen.add(x.source); out.push(x); } }
  return out;
}
function keywordIdeas(title) {
  const skip = /^(The|A|An|College|Football|Week|After|How|What|Why|Who|In|On|At|For|With|From|And|vs|No|Top)$/;
  const out = new Set();
  for (const m of title.matchAll(/\b([A-Z][\w'’.-]+(?:\s+[A-Z][\w'’.-]+)*)/g)) { const p = m[1].split(/\s+/).filter((w) => !skip.test(w)).join(' '); if (p.length > 2) out.add(p); }
  return [...out].filter((k) => !S.muteKeywords.includes(k)).slice(0, 4);
}
function openStory(link) {
  const it = ITEMS.get(link); if (!it) return;
  tick();
  let sh = $('#sheet');
  if (!sh) {
    sh = document.createElement('div'); sh.id = 'sheet';
    sh.innerHTML = '<div class="sheet-bg" data-close></div><div class="sheet" role="dialog" aria-modal="true" aria-label="Story"><div class="grab"><span></span></div><button class="sheet-x" data-close aria-label="Close">✕</button><div class="sheet-body"></div></div>';
    document.body.appendChild(sh); document.body.classList.add('modal-open');
    requestAnimationFrame(() => requestAnimationFrame(() => sh.classList.add('open')));
    history.pushState({ sheet: 1 }, '');
    sh.addEventListener('click', onSheetClick); sh.addEventListener('submit', onSheetSubmit);
    dragToClose($('.sheet', sh));
  }
  sh.dataset.link = link;
  const others = alsoCovered(it);
  const why = it.type === 'news' ? 'Labeled <b>straight news</b> — no opinion, analysis or betting signals found.' : `Labeled <b>${esc(TYPE_LABEL[it.type])}</b>: ${esc(it.reasons.join('; '))}`;
  $('.sheet-body', sh).innerHTML = `
    <div class="m"><span class="src">${esc(it.source)}</span>${it.type !== 'news' ? `<span class="tag">${TYPE_LABEL[it.type]}</span>` : ''}<span>${timeAgo(it.published)}</span>${it.via && it.via !== it.source ? `<span class="faint">via ${esc(it.via)}</span>` : ''}</div>
    <h2 class="story-t selectable">${esc(it.title)}</h2>
    ${it.summary ? `<p class="story-s selectable">${esc(it.summary)}</p>` : ''}
    <a class="btn primary xl" href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">Read at ${esc(it.source)} ↗</a>
    ${others.length ? `<div class="lbl">Also covered by ${others.length} other source${others.length > 1 ? 's' : ''}</div><div class="list card">${others.map((o) => { ITEMS.set(o.link, o); return `<button class="row" data-story="${esc(o.link)}"><span class="rt"><b>${esc(o.title)}</b><small>${esc(o.source)} · ${timeAgo(o.published)}</small></span><span class="chev">›</span></button>`; }).join('')}</div>` : ''}
    <div class="why">${why}</div>
    <div class="lbl">Not for you?</div>
    <div class="list card"><button class="row" data-sact="block">${icon('block', '#c2332b')}<span class="rt"><b>Hide everything from ${esc(it.source)}</b><small>You can undo this in Settings → News sources</small></span></button></div>
    <div class="chips" style="margin-top:10px">${keywordIdeas(it.title).map((k) => `<button class="chip lg ghost" data-skw="${esc(k)}">🔇 Mute “${esc(k)}”</button>`).join('')}</div>
    <form class="kw-form" data-sform="kw"><input placeholder="Mute another keyword…" autocomplete="off" enterkeyhint="done" /><button class="btn">Mute</button></form>`;
  $('.sheet-body', sh).scrollTop = 0;
}
function closeSheet(fromPop) {
  const sh = $('#sheet'); if (!sh || sh.dataset.closing) return;
  sh.dataset.closing = '1'; sh.classList.remove('open'); document.body.classList.remove('modal-open');
  setTimeout(() => sh.remove(), 280);
  if (!fromPop && history.state && history.state.sheet) history.back();
}
function onSheetClick(e) {
  if (e.target.closest('[data-close]')) { closeSheet(); return; }
  const st = e.target.closest('[data-story]'); if (st) { e.stopPropagation(); openStory(st.dataset.story); return; }
  const sh = $('#sheet'); const it = ITEMS.get(sh.dataset.link);
  const b = e.target.closest('[data-sact],[data-skw]'); if (!b || !it) return;
  tick();
  if (b.dataset.sact === 'block') { S.blockOutlets = [...new Set([...(S.blockOutlets || []), it.source])]; save(); toast(`Hidden: ${it.source}`); }
  if (b.dataset.skw) { S.muteKeywords = [...new Set([...S.muteKeywords, b.dataset.skw])]; save(); toast(`Muted “${b.dataset.skw}”`); }
  closeSheet(); route(true);
}
function onSheetSubmit(e) {
  e.preventDefault(); const v = $('input', e.target).value.trim(); if (!v) return;
  S.muteKeywords = [...new Set([...S.muteKeywords, v])]; save(); toast(`Muted “${v}”`); closeSheet(); route(true);
}
function dragToClose(sheet) {
  let y0 = null; let dy = 0;
  sheet.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    const body = $('.sheet-body', sheet);
    if (!e.target.closest('.grab') && body.scrollTop > 0) return;
    y0 = e.clientY; dy = 0;
  });
  sheet.addEventListener('pointermove', (e) => { if (y0 == null) return; dy = e.clientY - y0; if (dy > 0) { sheet.style.transition = 'none'; sheet.style.transform = `translateY(${dy}px)`; } });
  const end = () => { if (y0 == null) return; y0 = null; sheet.style.transition = ''; sheet.style.transform = ''; if (dy > 110) closeSheet(); };
  sheet.addEventListener('pointerup', end); sheet.addEventListener('pointercancel', end);
}
addEventListener('popstate', () => { if ($('#sheet')) closeSheet(true); });
document.addEventListener('click', (e) => {
  const st = e.target.closest('[data-story]'); if (!st || st.closest('#sheet')) return;
  e.preventDefault(); openStory(st.dataset.story);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#sheet')) closeSheet();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-story]')) { e.preventDefault(); openStory(e.target.dataset.story); }
});
// tap feedback for tab bar + links
document.addEventListener('pointerdown', (e) => { if (e.target.closest('.nav a, .side-teams a, a.row, .h2-link')) tick(); }, { passive: true });

// ---------------- pull to refresh (touch) ----------------
(function pullToRefresh() {
  const el = $('#ptr'); let y0 = null; let x0 = 0; let busy = false; let ready = false;
  const reset = () => { el.classList.remove('show', 'ready', 'spin'); el.style.transform = ''; ready = false; };
  addEventListener('touchstart', (e) => {
    if (busy || scrollY > 0 || document.body.matches('.onb-open, .modal-open') || e.touches.length > 1) { y0 = null; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX;
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (y0 == null) return; const dy = e.touches[0].clientY - y0; const dx = Math.abs(e.touches[0].clientX - x0);
    if (dy <= 0 || dx > dy) { y0 = null; reset(); return; }
    if (e.cancelable) e.preventDefault(); // we own this gesture now (no native overscroll / browser reload)
    const p = Math.min(dy * 0.5, 96); ready = p >= 64;
    el.classList.add('show'); el.classList.toggle('ready', ready); el.style.transform = `translate(-50%, ${p}px) rotate(${p * 4}deg)`;
  }, { passive: false });
  addEventListener('touchcancel', () => { if (!busy) { y0 = null; reset(); } });
  addEventListener('touchend', async () => {
    if (y0 == null) return; y0 = null;
    if (!ready) { reset(); return; }
    busy = true; tick(); el.classList.add('spin'); el.style.transform = 'translate(-50%, 64px)';
    mem.clear();
    try { await route(true); toast('Up to date'); } finally { reset(); busy = false; }
  });
})();

// ---------------- sport switcher + Gamecast interactions ----------------
const SWITCH_TABS = ['home', 'scores', 'news', 'rankings'];
function syncSportUI(name) {
  if (name == null) name = (location.hash || '#/home').split('/')[1] || 'home';
  const bar = $('#sportbar');
  const show = S.sports.length > 1 && SWITCH_TABS.includes(name);
  bar.hidden = !show; document.body.classList.toggle('has-sportbar', show);
  bar.innerHTML = S.sports.map((k) => `<button class="chip ${k === S.sport ? 'on' : ''}" data-switch="${k}" aria-pressed="${k === S.sport}"><span aria-hidden="true">${SPORTS[k].emoji}</span>${esc(SPORTS[k].short)}</button>`).join('');
  const on = bar.querySelector('.on'); if (show && on && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = Math.max(0, on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2);
  const lbl = $('#tab4-label'); if (lbl) lbl.textContent = SPORTS[S.sport].tab4;
  document.title = `Straight Sports · ${SPORTS[S.sport].short}`;
}
document.addEventListener('click', (e) => {
  const sw = e.target.closest('[data-switch]');
  if (sw) {
    if (sw.dataset.switch === S.sport) return; tick();
    S.sport = sw.dataset.switch; save(); mem.forEach((_, k) => k.startsWith('/api/news') && mem.delete(k));
    syncSportUI(); scrollTo(0, 0); route(true); return;
  }
  const inCast = (location.hash || '').startsWith('#/game/');
  const tab = e.target.closest('[data-gctab]');
  if (tab && inCast) { tick(); castState.tab = tab.dataset.gctab; viewGame(castState.sport, castState.id, true); return; }
  const pf = e.target.closest('[data-pfollow]');
  if (pf) {
    e.preventDefault(); e.stopPropagation(); tick();
    const id = pf.dataset.pfollow; const on = follows(id);
    rememberPlayer(id, pf.dataset.pname, pf.dataset.pflag);
    S.follow = toggle(S.follow, id); if (!on) S.muteTeams = S.muteTeams.filter((x) => x !== id);
    save(); toast(on ? `Unfollowed ${pf.dataset.pname}` : `Following ${pf.dataset.pname}`);
    if (inCast) viewGame(castState.sport, castState.id, true); else route(true);
    return;
  }
  const g = e.target.closest('[data-golfer]');
  if (g && inCast) { tick(); castState.player = castState.player === g.dataset.golfer ? null : g.dataset.golfer; viewGame(castState.sport, castState.id, true); return; }
  const card = e.target.closest('[data-game]');
  if (card && !e.target.closest('a[href]:not([data-game])') && !e.defaultPrevented) {
    if (g) castState.player = g.dataset.golfer;
    tick(); location.hash = card.dataset.game;
  }
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-game]')) { e.preventDefault(); location.hash = e.target.dataset.game; }
});

// ---------------- router + screen transitions ----------------
// Live auto-refresh: 30s on lists, ~20s in Gamecast; paused while the tab is hidden, caught up when it returns.
let refreshLive = false;
function liveTick() {
  if (document.hidden || $('#sheet') || $('#onb')) return;
  for (const k of mem.keys()) if (k.startsWith('/api/scoreboard') || k.startsWith('/api/game')) mem.delete(k);
  route(true);
}
function scheduleRefresh(live, ms = 30e3) {
  clearInterval(refreshTimer); refreshLive = !!live;
  if (live) refreshTimer = setInterval(liveTick, ms);
  const ind = $('#live-ind'); if (ind) ind.hidden = !live;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && refreshLive) liveTick(); });
const HIST = []; let prevDepth = 0; let lastTab = 'home';
async function route(silent) {
  if (!silent) clearInterval(refreshTimer);
  if (!silent && $('#sheet')) { $('#sheet').remove(); document.body.classList.remove('modal-open'); }
  view.onclick = view.onchange = view.oninput = view.onsubmit = null;
  const h = location.hash || '#/home';
  const [, name = 'home', arg, arg2] = h.split('/');
  if (name !== 'team' && name !== 'game') lastTab = name;
  syncSportUI(name);
  if (!silent) { if (HIST[HIST.length - 2] === h) HIST.pop(); else if (HIST[HIST.length - 1] !== h) HIST.push(h); }
  document.querySelectorAll('.nav a[data-tab]').forEach((a) => a.classList.toggle('active', a.dataset.tab === lastTab));
  document.querySelectorAll('.side-teams a').forEach((a) => a.classList.toggle('active', name === 'team' && a.dataset.team === arg));
  const depth = name === 'team' || name === 'game' || (name === 'settings' && arg) ? 1 : 0;
  if (!silent) {
    const cls = depth > prevDepth ? 'push' : depth < prevDepth ? 'pop' : 'fade';
    view.classList.remove('push', 'pop', 'fade'); void view.offsetWidth; view.classList.add(cls); prevDepth = depth;
    scrollTo(0, 0);
  }
  const y = scrollY; SILENT = !!silent;
  try {
    if (name === 'scores') await viewScores();
    else if (name === 'news') await viewNews();
    else if (name === 'rankings') await viewRankings();
    else if (name === 'team' && arg) await viewTeam(decodeURIComponent(arg));
    else if (name === 'game' && arg2) await viewGame(arg, decodeURIComponent(arg2), silent);
    else if (name === 'settings') viewSettings(arg);
    else await viewHome();
  } catch (e) { console.error(e); view.innerHTML = errBox(e); }
  SILENT = false;
  if (silent) scrollTo(0, y);
  if (!S.onboarded && !$('#onb')) openOnboarding(0);
}

async function boot() {
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); route(true); });
  const splash = $('#splash'); const t0 = performance.now();
  try {
    const [s, ...ts] = await Promise.all([api('/api/sources', 36e5), ...['cfb', 'nfl', 'mlb'].map((k) => api(`/api/teams?sport=${k}`, 36e5).catch(() => ({ teams: [], conferences: [] })))]);
    SOURCES = s;
    ['cfb', 'nfl', 'mlb'].forEach((k, n) => { TEAMS_BY[k] = ts[n].teams.map((t) => ({ ...t, sport: k })); DIVS_BY[k] = ts[n].conferences; });
    TEAMS = [...TEAMS_BY.cfb, ...TEAMS_BY.nfl, ...TEAMS_BY.mlb]; CONFS = DIVS_BY.cfb;
    if (!TEAMS.length) throw new Error('team lists unavailable');
  } catch (e) { splash.remove(); view.innerHTML = errBox(e); return; }
  const known = (id) => (teamSport(sportOfId(id)) ? TEAMS.some((t) => t.id === id) : !!S.players[id]);
  S.follow = S.follow.filter(known); S.muteTeams = S.muteTeams.filter(known);
  renderSideTeams();
  window.addEventListener('hashchange', () => route());
  route();
  setTimeout(() => { splash.classList.add('hide'); setTimeout(() => splash.remove(), 450); }, Math.max(0, 450 - (performance.now() - t0)));
}
boot();
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
