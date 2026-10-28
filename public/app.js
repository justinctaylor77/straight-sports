import { buildGroups, subGroups, leagueTeams, fullName } from './picker.js?v=25';
import { LEAGUE_MUTES, mutedSports, DEFAULTS, SPORTS, SPORT_IDS, CORE, sportOfId, isAthleteId, loadSettings, saveSettings, teamMatcher, buildMuteFilter, cluster, timeAgo, itemText, tokens, similar } from './lib.js';
import { GROUPS as SPORT_GROUPS } from './catalog.js';
import { renderGamecast, castTitle, castState, golfRow, tennisMatch, eventCard } from './gamecast.js?v=25';
import * as GA from './anim.js?v=18';
import * as BD from './backdrop.js';
import { scheduleSections, playerHero, playerTabs, playerBody } from './people.js?v=19';
import { applyTeamTheme, clearTeamTheme } from './teamtheme.js';
import { watchButtons, PROVIDERS } from './watch.js';
import { createLists, FEED as LIST_FEED } from './lists.js?v=25';

// ---------------- state ----------------
let S = loadSettings();
let TEAMS = []; let CONFS = []; let SOURCES = [];
const TEAMS_BY = {}; const DIVS_BY = {}; // team lists per team sport, loaded on demand
const PLAYERS_BY = {}; // golf / tennis player lists, loaded on demand
const SP = () => S.sport; const SPI = () => SPORTS[S.sport];
const teamSport = (sp) => (SPORTS[sp] || {}).kind === 'team';
const eventSport = (sp) => (SPORTS[sp] || {}).kind === 'event';
const newsSport = (sp) => (SPORTS[sp] || {}).kind === 'news';
async function ensureTeams(sp) {
  if (!teamSport(sp) || (TEAMS_BY[sp] && TEAMS_BY[sp].length)) return;
  if (!ensureTeams[sp]) ensureTeams[sp] = api(`/api/teams?sport=${sp}`, 36e5).then((d) => {
    TEAMS_BY[sp] = d.teams.map((t) => ({ ...t, sport: sp })); DIVS_BY[sp] = d.conferences || [];
    TEAMS = Object.values(TEAMS_BY).flat(); if (sp === 'cfb') CONFS = DIVS_BY.cfb;
  }).catch(() => { TEAMS_BY[sp] = TEAMS_BY[sp] || []; DIVS_BY[sp] = DIVS_BY[sp] || []; }).finally(() => { ensureTeams[sp] = null; });
  return ensureTeams[sp];
}
const view = document.getElementById('view');
let refreshTimer = null;
let SILENT = false; // true during background refreshes (no skeleton flash)
const mem = new Map();
const ITEMS = new Map(); const GROUPS = new Map(); let POOL = [];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
// Teams (all team sports) and followed/muted players share one id space: "252" (CFB), "nfl:3", "mlb:8", "golf:9478", "tennis:3623".
const playerEnt = (id) => { const p = S.players[id]; return p ? { id, name: p.name, short: p.short || p.name, location: p.name, logo: p.flag, logoDark: p.flag, sport: sportOfId(id), team: p.team || null, pos: p.pos || '', player: true } : null; };
const teamById = (id) => TEAMS.find((t) => t.id === String(id)) || playerEnt(String(id));
const entities = () => [...TEAMS, ...Object.keys(S.players).map(playerEnt)];
const followsIn = (sp) => S.follow.filter((id) => sportOfId(id) === sp);
const follows = (id) => S.follow.includes(String(id));
const rememberPlayer = (id, name, flag, extra = {}) => { if (!id || !name) return; const o = { ...(S.players[id] || {}), name, flag: flag || (S.players[id] || {}).flag || '' }; for (const [k, v] of Object.entries(extra)) if (v) o[k] = v; S.players[id] = o; };
// teams the user cares about in a sport: followed teams + the teams of followed players
const myTeamIds = () => new Set([...S.follow, ...S.follow.map((id) => (S.players[id] || {}).team).filter(Boolean)]);
const myPlayersOn = (teamId) => S.follow.filter((id) => isAthleteId(id) && (S.players[id] || {}).team === teamId).map((id) => S.players[id]);
const isDark = () => (S.theme === 'dark') || (S.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
const logo = (t) => (t ? (isDark() ? t.logoDark || t.logo : t.logo) : '');
// Fallback only when a logo fails to load: dark variant → the team's regular ESPN logo → a neutral badge (never initials
// or another team's logo). Backdrop logos are simply removed.
const LOGO_FB = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M20 3 6 8v11c0 9 6 15 14 18 8-3 14-9 14-18V8z" fill="#8a8f98" fill-opacity=".35" stroke="#8a8f98" stroke-width="2"/></svg>')}`;
addEventListener('error', (e) => {
  const img = e.target; if (!(img instanceof HTMLImageElement) || img.dataset.lf) return;
  const u = img.getAttribute('src') || '';
  if (u.includes('/500-dark/')) { img.src = u.replace('/500-dark/', '/500/'); return; }
  if (img.classList.contains('bd-logo')) { img.remove(); return; }
  if (!u || /teamlogos/.test(u)) { img.dataset.lf = '1'; img.classList.add('logo-fb'); img.src = LOGO_FB; }
}, true);
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
  syncThemeColor();
}
function syncThemeColor() {
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || (isDark() ? '#061225' : '#F2F5FB');
  metas.forEach((m, i) => { if (i) m.remove(); else { m.removeAttribute('media'); m.content = bg; } });
}
// team pages wear the team's ESPN colors; every other page is back to red-white-and-blue
function teamTheme(t) { if (!t || !applyTeamTheme(t, isDark())) clearTeamTheme(); syncThemeColor(); }
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (document.documentElement.dataset.team) route(true); else syncThemeColor(); });

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
  const k = JSON.stringify([S.muteKeywords, S.muteLeagues, S.muteTeams, S.sportOnly, TEAMS.length, S.sport, S.muteUnselected, S.sportsChosen, S.sports, SPORT_IDS.length]);
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
  const tm = ids.filter((id) => !isAthleteId(id)); const nm = ids.filter(isAthleteId).map((id) => (teamById(id) || {}).name).filter(Boolean);
  const q = `${teamSport(sp) && tm.length ? `&teams=${encodeURIComponent(tm.join(','))}` : ''}${nm.length ? `&names=${encodeURIComponent(nm.join('|'))}` : ''}`;
  return `/api/news?sport=${sp}&sources=${encodeURIComponent(src)}${q}`;
}

// ---------------- shared renderers ----------------
function teamRow(c, ev) {
  const t = c.team || {};
  const lost = ev.state === 'post' && !c.winner && (ev.home.winner || ev.away.winner);
  const mine = S.follow.includes(t.id); const mp = myPlayersOn(t.id);
  const poss = ev.state === 'in' && ev.possession && ev.possession === t.id;
  return `<div class="trow ${lost ? 'lost' : ''}">
    <img src="${esc(logo(t))}" alt="" loading="lazy" width="28" height="28" />
    <a class="nm" href="#/schedule/${t.id}" title="${esc(t.short || t.name)} schedule">${c.rank ? `<span class="rk">${c.rank}</span>` : ''}<b>${esc(t.short || t.name)}</b>${mine ? '<span class="star" title="Following">●</span>' : mp.length ? `<span class="star" title="Your player${mp.length > 1 ? 's' : ''}: ${esc(mp.map((p) => p.name).join(', '))}">★</span>` : ''}${poss ? '<span class="poss" title="Possession">◂</span>' : ''}<span class="rec">${esc(c.record || '')}</span></a>
    <span class="sc">${ev.state === 'pre' ? '' : esc(c.score ?? '')}</span></div>`;
}
function gameCard(ev) {
  const mine = isMineEv(ev);
  const mp = [...myPlayersOn(ev.away.team?.id), ...myPlayersOn(ev.home.team?.id)];
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
    <div class="meta">${live}${extra}${mp.length ? `<span class="yp-tag">★ ${esc(mp.slice(0, 2).map((p) => p.short || p.name.split(' ').slice(-1)[0]).join(', '))}</span>` : ''}<span>${esc(ev.venue || '')}</span>${ev.conferenceGame ? '<span>· Conf</span>' : ''}${ev.neutral ? '<span>· Neutral</span>' : ''}<span class="gc-go">Gamecast ›</span></div></div>`;
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
  const nu = mutedSports(S).length; if (nu) { out.push(`${nu} unselected sport${nu > 1 ? 's' : ''}`); seen.add('unselected'); }
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
  el.innerHTML = l.length ? `<div class="side-lbl">Following</div>${l.map((t) => `<a href="${t.player ? `#/player/${t.id}` : `#/team/${t.id}`}" data-team="${t.id}" data-sp="${t.sport || 'cfb'}"><img src="${esc(logo(t))}" alt="" width="22" height="22" class="${t.player ? 'flag' : ''}" /><span>${esc(t.short)}</span><small>${esc((SPORTS[t.sport || 'cfb'] || {}).short || '')}</small></a>`).join('')}` : '';
}

// ---------------- views ----------------
const sbPath = (sp, extra = '') => `/api/scoreboard?sport=${sp}${extra}`;
const isMineEv = (e) => { if (e.comps) return e.comps.some((c) => c.competitors.some((x) => S.follow.includes(x.id))); const m = myTeamIds(); return m.has(e.home.team?.id) || m.has(e.away.team?.id); };
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
  await viewHomeBase();
  if (view.querySelector(".lb-promo")) return;
  const lt = view.querySelector('.lt'); if (lt) lt.insertAdjacentHTML('afterend', LISTS.hubPromo());
}
async function viewHomeBase() {
  setBar('Home');
  const sp = S.sport;
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  paint(LT(SPORTS[sp].name, today) + `<div class="cols"><section><h2>${sp === 'golf' ? 'This week' : sp === 'tennis' ? 'Your players' : eventSport(sp) ? 'Events' : 'Your games'}</h2>${SK.games(3)}</section><section><h2>Top stories for you</h2>${SK.news(6)}</section></div>`);
  if (sp === 'golf') return homeGolf(today);
  if (sp === 'tennis') return homeTennis(today);
  if (eventSport(sp)) return homeEvents(today);
  if (newsSport(sp)) return homeNewsOnly(today);
  await ensureTeams(sp);
  const [sb, news] = await Promise.allSettled([api(sbPath(sp), 10e3), api(newsPath(), 5 * 60e3)]);
  const mf = muteFilter();
  let html = '';
  if (sb.status === 'fulfilled') {
    const evs = sb.value.events.filter((e) => !mf.game(e));
    let mine = evs.filter(isMineEv).sort(sortGames);
    if (SPORTS[sp].daily) { // one per team: live, else next, else latest
      const my = myTeamIds(); const ord = (e) => (e.state === 'in' ? 0 : e.state === 'pre' ? 1 : 2);
      const byTeam = [...mine].sort((a, b) => ord(a) - ord(b) || (a.state === 'post' ? Date.parse(b.date) - Date.parse(a.date) : Date.parse(a.date) - Date.parse(b.date)));
      const pick = new Map(); for (const e of byTeam) for (const id of [e.home.team.id, e.away.team.id]) if (my.has(id) && !pick.has(id)) pick.set(id, e);
      mine = [...new Set(pick.values())].sort(sortGames);
    }
    const confSet = new Set(S.conferences);
    const live = evs.filter((e) => e.state === 'in' && !mine.includes(e) && (sp !== 'cfb' || !confSet.size || confSet.has(e.home.conferenceId) || confSet.has(e.away.conferenceId)));
    const sub = SPORTS[sp].daily || !sb.value.week ? today : `Week ${esc(sb.value.week)} · ${today}`;
    html += LT(SPORTS[sp].name, sub);
    html += `<div class="cols"><section><h2>Your games <span class="count">${mine.length}</span><a class="h2-link" href="#/scores">All scores ›</a></h2>`;
    html += mine.length ? `<div class="grid">${mine.map(gameCard).join('')}</div>` : `<div class="card empty">${followsIn(sp).length ? (SPORTS[sp].daily ? 'No games for your teams in the last few days or the next few.' : 'No games for your teams this week (bye week?).') : noFollowMsg(sp)}</div>`;
    if (live.length) html += `<h2>Live now <span class="count">${live.length}</span></h2><div class="grid">${live.slice(0, 6).map(gameCard).join('')}</div>`;
    if (!mine.length && !live.length) {
      const next = evs.filter((e) => e.state !== 'post').sort(sortGames).slice(0, 4);
      if (next.length) html += `<h2>Coming up</h2><div class="grid">${next.map(gameCard).join('')}</div>`;
    }
    if (sp === 'cfb') html += await grokPromo();
    if (followsIn(sp).length) {
      try {
        const my = myTeamIds();
        const rk = await api(`/api/rankings?sport=${sp}`, 10 * 60e3);
        if (rk.polls) {
          const ap = rk.polls.find((p) => p.id === 'ap') || rk.polls[0];
          const ranked = ap ? ap.ranks.filter((r) => my.has(r.team.id)) : [];
          html += `<h2>Your teams in the ${esc(ap ? (ap.id === 'ap' ? 'AP poll' : ap.name) : 'poll')}<a class="h2-link" href="#/rankings">Top 25 ›</a></h2><div class="card panel">${ranked.length ? ranked.map(rankRow).join('') : '<div class="empty">None of your teams are ranked this week.</div>'}</div>`;
        } else if (rk.groups) {
          const rows = rk.groups.flatMap((g) => g.rows.map((r) => ({ ...r, div: g.name }))).filter((r) => my.has(r.team.id));
          if (rows.length) html += `<h2>Your teams in the standings<a class="h2-link" href="#/rankings">Standings ›</a></h2>${rk.cols ? genStandTable({ name: 'Your teams', rows }, rk.cols, true) : `<div class="card panel">${rows.map((r) => standRow(r, sp, true)).join('')}</div>`}`;
        }
      } catch { /* optional */ }
    }
    html += `</section>`;
  } else html += LT(SPORTS[sp].name, today) + `${errBox(sb.reason)}<div class="cols"><section></section>`;
  html = await newsColumn(html, news);
  view.innerHTML = html + '</div>';
  scheduleRefresh(sb.status === 'fulfilled' && sb.value.events.some((e) => e.state === 'in'));
}

// event sports (UFC, F1, NASCAR, IndyCar): your fighters/drivers first, then live, upcoming, latest
async function homeEvents(today) {
  const sp = S.sport;
  const [eb, news] = await Promise.allSettled([api(sbPath(sp), 10e3), api(newsPath(), 5 * 60e3)]);
  let html = LT(SPORTS[sp].name, today) + '<div class="cols"><section>';
  const ctx = castCtx(); let anyLive = false;
  if (eb.status === 'fulfilled') {
    const evs = eb.value.events || []; anyLive = evs.some((e) => e.state === 'in');
    const mine = evs.filter(isMineEv);
    const live = evs.filter((e) => e.state === 'in' && !mine.includes(e));
    const next = evs.filter((e) => e.state === 'pre' && !mine.includes(e)).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).slice(0, 2);
    const last = evs.filter((e) => e.state === 'post' && !mine.includes(e)).sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 2);
    html += `<h2>Your ${esc(SPORTS[sp].what)} <span class="count">${mine.length}</span><a class="h2-link" href="#/scores">All events ›</a></h2>`;
    html += mine.length ? mine.map((e) => eventCard(e, ctx)).join('') : `<div class="card empty">${followsIn(sp).length ? `Your ${esc(SPORTS[sp].what)} aren’t on these cards.` : noFollowMsg(sp)}</div>`;
    if (live.length) html += `<h2>Live now</h2>${live.map((e) => eventCard(e, ctx)).join('')}`;
    if (next.length) html += `<h2>Coming up</h2>${next.map((e) => eventCard(e, ctx)).join('')}`;
    if (last.length) html += `<h2>Latest results</h2>${last.map((e) => eventCard(e, ctx)).join('')}`;
    if (!evs.length) html += '<div class="card empty">No events this week.</div>';
  } else html += errBox(eb.reason);
  html += '</section>';
  html = await newsColumn(html, news);
  view.innerHTML = html + '</div>';
  scheduleRefresh(anyLive);
}
// news-only sports (boxing): ESPN has no usable scoreboard, so headlines only
async function homeNewsOnly(today) {
  const sp = S.sport;
  const news = (await Promise.allSettled([api(newsPath(), 5 * 60e3)]))[0];
  let html = LT(SPORTS[sp].name, today) + `<div class="cols"><section><h2>Scores</h2><div class="card empty">${esc(SPORTS[sp].name)} is headlines-only: ESPN’s free feeds don’t carry live ${esc(SPORTS[sp].name.toLowerCase())} results.</div></section>`;
  html = await newsColumn(html, news, 'Top stories');
  view.innerHTML = html + '</div>';
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
  const [gb, news] = await Promise.allSettled([api(sbPath('golf'), 10e3), api(newsPath(), 5 * 60e3)]);
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
  const [tb, news] = await Promise.allSettled([api(sbPath('tennis'), 10e3), api(newsPath(), 5 * 60e3)]);
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
  if (eventSport(sp)) return scoresEvents(quick);
  if (newsSport(sp)) { view.innerHTML = LT('Scores') + `<div class="card empty">${esc(SPORTS[sp].name)} is headlines-only — ESPN’s free feeds have no ${esc(SPORTS[sp].name.toLowerCase())} scoreboard. <a href="#/news">Read the news ›</a></div>`; return; }
  await ensureTeams(sp);
  const weekly = !SPORTS[sp].daily;
  if (!scoresMode) scoresMode = S.conferences.length ? 'conf' : 'all';
  const wk = scoresWeek && weekly ? `&week=${scoresWeek.split(':')[1]}&seasontype=${scoresWeek.split(':')[0]}` : '';
  const path = sbPath(sp, wk);
  if (!quick) paint(LT('Scores', SK.sub()) + `<div class="toolbar sticky"><span class="sk w30 btnlike"></span><span class="sk w40 btnlike"></span></div><h2>Your teams</h2>${SK.games(3)}<h2><span class="sk w15 sm inline"></span></h2>${SK.games(6)}`);
  let sb;
  try { sb = await api(path, 30e3); } catch (e) { view.innerHTML = LT('Scores') + errBox(e); return; }
  const mf = muteFilter();
  const all = sb.events; const evs = all.filter((e) => !mf.game(e)); const mutedCount = all.length - evs.length;
  const mine = evs.filter(isMineEv).sort(sortGames);
  const rest = evs.filter((e) => !isMineEv(e));
  let toolbar = ''; let sub = '';
  // Everything that isn't a favorite, filtered to what the page is set to show (CFB: My confs / All FBS)
  let pool = rest;
  if (sp === 'cfb') {
    const confIds = scoresMode === 'all' || !S.conferences.length ? null : new Set(S.conferences);
    pool = confIds ? rest.filter((e) => confIds.has(e.home.conferenceId) || confIds.has(e.away.conferenceId)) : rest;
  }
  // Order of the page: Favorites → Live now → Upcoming → Finished (a game is only ever shown once)
  const live = pool.filter((e) => e.state === 'in').sort(sortGames);
  const upcoming = pool.filter((e) => e.state === 'pre').sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const finished = pool.filter((e) => e.state === 'post').sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const block = (title, list, extra = '') => {
    if (!list.length) return '';
    const days = new Set(list.map((e) => dayKey(e.date)));
    let body;
    if (days.size > 1) { // several days in one section: a small date label above each day's games
      const byDay = new Map(); for (const e of list) { const k = dayKey(e.date); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(e); }
      body = [...byDay.values()].map((g) => `<h3 class="dayh">${esc(dayLabel(g[0].date))}</h3><div class="grid">${g.map(gameCard).join('')}</div>`).join('');
    } else body = `<div class="grid">${list.map(gameCard).join('')}</div>`;
    return `<section class="sc-sec ${extra}"><h2>${title} <span class="count">${list.length}</span></h2>${body}</section>`;
  };
  const sections = [block('<span class="livet">●</span> Live now', live, 'is-live'), block('Upcoming', upcoming), block('Finished', finished)];
  if (weekly && sb.calendar && sb.calendar.length) {
    const cur = `${sb.seasontype}:${sb.week}`; const sel = (scoresWeek || cur);
    const curLabel = (sb.calendar.find((w) => `${w.seasontype}:${w.week}` === sel) || {});
    const weekOpts = sb.calendar.map((w) => `<option value="${w.seasontype}:${w.week}" ${`${w.seasontype}:${w.week}` === sel ? 'selected' : ''}>${esc(w.label)}${w.detail ? ` (${esc(w.detail)})` : ''}</option>`).join('');
    toolbar = `<select class="btn" id="week" aria-label="Week" data-cur="${cur}">${weekOpts}</select>`;
    sub = `${esc(curLabel.label || `Week ${sb.week}`)}${curLabel.detail ? ` · ${esc(curLabel.detail)}` : ''} · your local time`;
    if (sp === 'cfb') toolbar += `<div class="seg" role="tablist"><button data-mode="mine" class="${scoresMode === 'mine' ? 'on' : ''}">My teams</button><button data-mode="conf" class="${scoresMode === 'conf' ? 'on' : ''}">My confs</button><button data-mode="all" class="${scoresMode === 'all' ? 'on' : ''}">All FBS</button></div>`;
  } else sub = `${sp === 'mlb' ? 'Last 7 days and the next 3' : 'Recent and upcoming days'} · your local time`;
  view.innerHTML = LT('Scores', sub) + `
    ${toolbar ? `<div class="toolbar sticky">${toolbar}</div>` : ''}
    ${mutedCount ? `<div class="notice">${mutedCount} game${mutedCount > 1 ? 's' : ''} hidden (muted teams)</div>` : ''}
    <h2>★ Favorites <span class="count">${mine.length}</span></h2>
    ${mine.length ? `<div class="grid">${mine.map(gameCard).join('')}</div>` : `<div class="card empty">${followsIn(sp).length ? 'No games for your teams or players in this window.' : `You aren’t following any ${esc(SPORTS[sp].short)} teams or players yet. <a href="#/settings/teams">Pick some</a>.`}</div>`}
    ${sp === 'cfb' && scoresMode === 'mine' ? '' : (sections.join('') || '<div class="empty">No other games.</div>')}`;
  const w = $('#week'); if (w) w.onchange = (e) => { tick(); scoresWeek = e.target.value === w.dataset.cur ? '' : e.target.value; viewScores(); };
  view.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { tick(); scoresMode = b.dataset.mode; viewScores(true); }));
  scheduleRefresh(!scoresWeek && evs.some((e) => e.state === 'in'));
}
async function scoresEvents(quick) {
  const sp = S.sport;
  if (!quick) paint(LT('Events', SK.sub()) + SK.games(4));
  let eb; try { eb = await api(sbPath(sp), 10e3); } catch (e) { view.innerHTML = LT('Events') + errBox(e); return; }
  const ctx = castCtx(); const evs = (eb.events || []).slice();
  const mine = evs.filter(isMineEv); const rest = evs.filter((e) => !mine.includes(e));
  const o = { in: 0, pre: 1, post: 2 };
  mine.sort((a, b) => o[a.state] - o[b.state] || Date.parse(a.date) - Date.parse(b.date));
  rest.sort((a, b) => o[a.state] - o[b.state] || (a.state === 'post' ? Date.parse(b.date) - Date.parse(a.date) : Date.parse(a.date) - Date.parse(b.date)));
  view.innerHTML = LT(`${esc(SPORTS[sp].short)} events`, `${evs.length} on ESPN’s board · your local time`)
    + (mine.length ? `<h2>Your ${esc(SPORTS[sp].what)} <span class="count">${mine.length}</span></h2><div class="grid">${mine.map((e) => eventCard(e, ctx, { n: 6 })).join('')}</div>` : '')
    + `<h2>${mine.length ? 'Everything else' : 'Events'} <span class="count">${rest.length}</span></h2><div class="grid">${rest.map((e) => eventCard(e, ctx, { n: 6 })).join('') || '<div class="empty">Nothing scheduled right now.</div>'}</div>`;
  scheduleRefresh(evs.some((e) => e.state === 'in'));
}
async function scoresGolf(quick) {
  if (!quick) paint(LT('Leaderboard', SK.sub()) + `<div class="toolbar sticky"><span class="sk w40 btnlike"></span></div>${SK.rows(14)}`);
  let gb; try { gb = await api(sbPath('golf'), 10e3); } catch (e) { view.innerHTML = LT('Leaderboard') + errBox(e); return; }
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
  let tb; try { tb = await api(sbPath('tennis'), 10e3); } catch (e) { view.innerHTML = LT('Draws') + errBox(e); return; }
  const ts = tb.tournaments; if (!ts.length) { view.innerHTML = LT('Draws') + '<div class="card empty">No tournaments this week.</div>'; return; }
  let t = ts.find((x) => x.id === tennisT) || ts[0]; tennisT = t.id;
  if (!t.draws.includes(tennisDraw)) tennisDraw = t.draws.find((d) => /Singles/.test(d)) || t.draws[0];
  const ctx = castCtx(); const mf = muteFilter();
  const ms = t.matches.filter((m) => m.draw === tennisDraw && !mf.game(m));
  const ord = { in: 0, pre: 1, post: 2 };
  const mineM = ms.filter(isMineEv).sort((a, b) => ord[a.state] - ord[b.state] || Date.parse(a.date) - Date.parse(b.date));
  const poolM = ms.filter((m) => !mineM.includes(m));
  // Favorites → Live → Upcoming → Finished; within a section, matches are grouped by round
  const tsec = (title, list, extra = '') => {
    if (!list.length) return '';
    const rounds = []; for (const m of list) { let r = rounds.find((x) => x.name === m.round); if (!r) rounds.push(r = { name: m.round, ms: [] }); r.ms.push(m); }
    const byTime = (a, b) => Date.parse(a.date) - Date.parse(b.date);
    return `<section class="sc-sec ${extra}"><h2>${title} <span class="count">${list.length}</span></h2>${rounds.map((r) => `<h3 class="dayh">${esc(r.name || '')}</h3><div class="grid">${r.ms.sort(byTime).map((m) => tennisMatch(m, ctx)).join('')}</div>`).join('')}</section>`;
  };
  view.innerHTML = LT(esc(t.name), `${esc(t.tour)} · ${esc(t.venue || '')}`) + `
    <div class="toolbar sticky"><select class="btn" id="tt" aria-label="Tournament">${ts.map((x) => `<option value="${esc(x.id)}" ${x.id === t.id ? 'selected' : ''}>${esc(x.tour)} · ${esc(x.name)}</option>`).join('')}</select>
      <div class="seg">${t.draws.map((d) => `<button data-draw="${esc(d)}" class="${d === tennisDraw ? 'on' : ''}">${esc(d.replace("Men's ", 'M ').replace("Women's ", 'W '))}</button>`).join('')}</div></div>
    ${tsec('★ Favorites', mineM, 'fav')}${tsec('<span class="livet">●</span> Live now', poolM.filter((m) => m.state === 'in'), 'live')}${tsec('Upcoming', poolM.filter((m) => m.state === 'pre'))}${tsec('Finished', poolM.filter((m) => m.state === 'post').sort((a, b) => Date.parse(b.date) - Date.parse(a.date)))}
    ${ms.length ? '' : '<div class="card empty">No matches in this draw right now.</div>'}`;
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
    if (newsMode === 'all' && followsIn(S.sport).length) { // boost: stories about your teams/players rank as if 12h newer
      const sc = (i) => (Date.parse(i.published || 0) || 0) + (i.mine.length ? 12 * 36e5 : 0);
      list = list.slice().sort((a, b) => sc(b) - sc(a));
    }
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
// generic standings table (NBA/NHL/soccer…): columns come from the server
function genStandTable(g, cols, withDiv) {
  const my = myTeamIds();
  return `<div class="card panel st-gen"><div class="st-row hd" style="--nc:${cols.length}"><span></span><span class="nm">${esc(g.name)}</span>${cols.map((c) => `<span class="n">${esc(c)}</span>`).join('')}</div>
    ${g.rows.map((r) => `<a class="st-row ${my.has(r.team.id) ? 'mine' : ''}" style="--nc:${cols.length}" href="#/team/${esc(r.team.id)}"><img src="${esc(logo(r.team))}" alt="" loading="lazy" /><span class="nm"><b>${esc(r.team.short || r.team.location)}</b>${withDiv && r.div ? ` <span class="faint small">${esc(r.div)}</span>` : ''}</span>${(r.cells || []).map((c) => `<span class="n">${esc(c)}</span>`).join('')}</a>`).join('')}</div>`;
}
const LISTS = createLists({ view, api, mem, setBar, LT, paint, SK, tick, S, SPORTS, logo, myTeamIds, openCfb: (h) => { S.sport = 'cfb'; save(); syncSportUI(); location.hash = h; } });
// v1.2.0: every sport's Rankings tab gets a link to its top list + bracket; the new pages live under #/rankings/{lists|list|playoffs}
async function viewRankings(quick) {
  if (LISTS.show(quick)) return;
  await viewRankingsBase(quick);
  if (!/^#\/rankings\/?$/.test(location.hash || '')) return;
  const lt = view.querySelector('.lt'); if (!lt || view.querySelector('.lb-promo')) return;
  lt.insertAdjacentHTML('afterend', LISTS.promo(S.sport) + (LIST_FEED.includes(S.sport) ? LISTS.hubPromo().replace('class="card gk-promo lb-promo"', 'class="card gk-promo lb-promo lb-promo2"') : ''));
}
async function viewRankingsBase(quick) {
  const sp = S.sport; const lbl = SPI().tab4;
  if (sp === 'cfb' && (location.hash || '').startsWith('#/rankings/bracket')) return viewBracket(quick);
  if (sp === 'cfb' && (location.hash || '').startsWith('#/rankings/grok/how')) return viewGrokHow(quick);
  if (sp === 'cfb' && (location.hash || '').startsWith('#/rankings/grok')) return viewGrok(quick);
  setBar(lbl);
  if (newsSport(sp)) { view.innerHTML = LT(lbl) + `<div class="card empty">ESPN’s free feeds have no ${esc(SPI().name)} rankings.${LIST_FEED.includes(sp) ? ' The top list and bracket below come from NCAA.com and other public sources.' : ''} <a href="#/news">Read the news ›</a></div>`; return; }
  if (!quick) paint(LT(lbl, SK.sub()) + `<div class="toolbar sticky"><span class="sk w40 btnlike"></span></div>${SK.rows(12)}`);
  let d; try { d = await api(`/api/rankings?sport=${sp}`, 10 * 60e3); } catch (e) { view.innerHTML = LT(lbl) + errBox(e); return; }
  const mf = muteFilter();
  if (d.cols && d.groups) {
    const lg = [...new Set(d.groups.map((g) => g.league || ''))];
    view.innerHTML = LT('Standings', `${d.season ? `${esc(d.season)} · ` : ''}ESPN`) + (d.groups.length ? lg.map((L) => `${lg.length > 1 && L ? `<h2>${esc(L)}</h2>` : ''}<div class="st-grid">${d.groups.filter((g) => (g.league || '') === L).map((g) => genStandTable({ ...g, rows: g.rows.filter((r) => !mf.teamId(r.team.id)) }, d.cols)).join('')}</div>`).join('') : '<div class="card empty">Standings aren’t posted yet this season.</div>');
    return;
  }
  if (eventSport(sp)) {
    const now = Date.now();
    const ev = (d.schedule || []).map((e) => ({ ...e, state: Date.parse(e.end || e.start) < now ? 'post' : Date.parse(e.start) <= now ? 'in' : 'pre' }));
    const row = (e) => `<a class="sched-row golf ${e.state === 'in' ? 'live' : ''}" href="#/game/${sp}/${esc(e.id)}"><span class="faint small">${new Date(e.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><span class="opp"><b>${esc(e.label)}</b></span><span class="small ${e.state === 'in' ? 'live' : 'faint'}">${e.state === 'in' ? 'LIVE' : e.state === 'post' ? 'Final' : ''}</span></a>`;
    const up = ev.filter((e) => e.state !== 'post'); const past = ev.filter((e) => e.state === 'post').reverse();
    view.innerHTML = LT('Schedule', `${esc(SPI().name)} season · ESPN`) + `<div class="cols"><section><h2>Upcoming</h2><div class="card panel">${up.map(row).join('') || '<div class="empty">Season complete.</div>'}</div></section>
      <section><h2>Completed</h2><div class="card panel">${past.slice(0, 40).map(row).join('') || '<div class="empty">None yet.</div>'}</div></section></div>`;
    return;
  }
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
    <div class="toolbar sticky"><div class="seg">${d.polls.map((p) => `<button data-poll="${p.id}" class="${p.id === poll.id ? 'on' : ''}">${p.id === 'ap' ? 'AP Top 25' : p.id === 'usa' ? 'Coaches Poll' : esc(p.name)}</button>`).join('')}${sp === 'cfb' ? '<a class="seg-a grok-tab" href="#/rankings/grok">JT Top 25</a><a class="seg-a grok-tab br-tab" href="#/rankings/bracket">Bracket</a>' : ''}</div></div>
    ${hiddenN ? `<div class="notice">${hiddenN} muted team(s) hidden</div>` : ''}
    <div class="card panel">${ranks.map(rankRow).join('')}</div>
    ${poll.others.length ? `<h2>Others receiving votes</h2><p class="muted small">${poll.others.filter((o) => !mf.teamId(o.team.id)).map((o) => `<a href="#/team/${o.team.id}">${esc(o.team.location)}</a> ${o.points}`).join(' · ')}</p>` : ''}
    <p class="faint small">Points shown with first-place votes in parentheses. Source: ESPN public rankings data.</p>`;
  view.querySelectorAll('[data-poll]').forEach((b) => (b.onclick = () => { tick(); pollId = b.dataset.poll; viewRankings(true); }));
}

// ---------------- Grok Top 25 (user's weekly Grok automation; live AP/Coaches/CFP from ESPN) ----------------
let grokTab = 'top'; let grokDate = '';
const gLogo = (i) => (i ? logo({ logo: i.logo, logoDark: i.logoDark }) : '');
const gName = (x) => (x && x.info ? x.info.short : x && x.team) || 'TBD';
async function grokPromo() {
  try {
    const g = await api('/api/grok-top25', 10 * 60e3);
    return `<a class="card gk-promo" href="#/rankings/grok"><div><div class="gk-kicker">Week ${esc(g.week)} · independent hybrid</div><div class="gk-title">JT Top 25</div><div class="faint small">${g.ranks.slice(0, 4).map((r) => `${r.rank}. ${esc(gName(r))}`).join(' · ')}</div></div><span class="go">View ›</span></a>
      <a class="card gk-promo" href="#/rankings/bracket"><div><div class="gk-kicker">12-team playoff</div><div class="gk-title">Playoff Bracket</div><div class="faint small">My bracket (JT) · AP projected · Official CFP</div></div><span class="go">View ›</span></a>`;
  } catch { return ''; }
}
function grokChart(g, lp) {
  const pos = (r) => `${((Math.min(r, 25) - 1) / 24) * 100}%`;
  const rows = g.ranks.map((r) => {
    const ap = r.live?.ap; const co = r.live?.coaches; const prev = r.prev;
    const lo = Math.min(r.rank, ap || 26); const hi = Math.max(r.rank, ap || 26);
    const d = ap ? ap - r.rank : null;
    return `<div class="gk-crow" style="--tc:#${esc(r.info?.color || '888')}"><span class="tn"><img src="${esc(gLogo(r.info))}" alt="" loading="lazy" /><span>${r.rank}. ${esc(gName(r))}</span></span>
      <span class="gk-track" role="img" aria-label="${esc(gName(r))}: JT ${r.rank}, AP ${ap || 'unranked'}, Coaches ${co || 'unranked'}">
        <span class="gk-bar" style="left:${pos(lo)};width:calc(${pos(Math.min(hi, 25))} - ${pos(lo)})"></span>
        ${prev ? `<span class="gk-dot last" style="left:${pos(prev)}"></span>` : ''}
        <span class="gk-dot co ${co ? '' : 'off'}" style="left:${pos(co || 25)}"></span><span class="gk-dot ap ${ap ? '' : 'off'}" style="left:${pos(ap || 25)}"></span><span class="gk-dot grok" style="left:${pos(r.rank)}"></span></span>
      <span class="gk-diff ${d > 0 ? 'mv up' : d < 0 ? 'mv dn' : ''}">${d == null ? 'AP NR' : d === 0 ? '=' : d > 0 ? `+${d}` : d}</span></div>`;
  }).join('');
  return `<div class="card gk-chart"><div class="gk-legend"><span><i class="dot-grok"></i>JT</span><span><i class="dot-ap"></i>AP</span><span><i class="dot-co"></i>Coaches</span>${g.ranks.some((r) => r.prev) ? '<span><i class="gk-dot last" style="position:static;display:inline-block;margin:0 5px 0 0"></i>JT last week</span>' : ''}<span>CFP: ${lp.cfpReleased ? 'shown in Top 25 tab' : 'not released'}</span></div>
    <div class="gk-axis"><span></span><span class="ticks"><span>1</span><span>5</span><span>10</span><span>15</span><span>20</span><span>25</span></span><span>vs AP</span></div>${rows}
    <p class="gk-note">“+n” means JT ranks the team n spots higher than the AP voters. Dots at the right edge are unranked in that poll.</p></div>`;
}
// ---------------- Playoff bracket: My (JT), AP projected, official CFP (/api/brackets; rules in server/brackets.js) ----------------
let brView = 'jt';
const BR_TYPE = { champ: (s) => `${s.conference} champ (proj.)`, g6: () => 'Top Group of 6 (auto bid)', nd: () => 'Auto bid (top 12)', atlarge: () => 'At-large' };
const BR_SHORT = { champ: (s) => `${s.conference} champ*`, g6: () => 'Top G6 (auto)', nd: () => 'Auto bid', atlarge: () => 'At-large' };
const SPOT_IDS = new Set(['254', '252']); // Utah, BYU are always highlighted
function brTeam(s, extra = '') {
  const my = myTeamIds();
  return `<div class="bt ${my.has(s.id) ? 'mine' : ''} ${SPOT_IDS.has(s.id) ? 'spot' : ''}" style="--tc:#${esc(s.color || '888')}"><span class="sd">${s.seed}</span><img src="${esc(logo(s))}" alt="" loading="lazy" /><span class="n"><b>${esc(s.short)}</b><small>${s.record ? `${esc(s.record)} · ` : ''}No. ${s.rank}</small><small class="ty ${esc(s.type)}">${esc(BR_SHORT[s.type](s))}</small></span>${extra}</div>`;
}
const brTbd = (t) => `<div class="bt tbd"><span class="sd"></span><span></span><span class="n"><b>${t}</b></span></div>`;
function brGrid(b) {
  const r1 = Object.fromEntries(b.firstRound.map((m) => [m.id, m]));
  const dim = (id) => { const m = r1[id]; return `${m.home.seed}/${m.away.seed}`; };
  const col = (title, cls) => `<div class="br-h ${cls}">${title}</div>`;
  let h = col('First round', 'c1') + col('Quarterfinals', 'c2') + col('Semifinals', 'c3') + col('National championship', 'c4');
  b.firstRound.forEach((m, i) => { h += `<div class="br-c c1" style="grid-row:${i + 2}"><div class="card br-game"><div class="host">${esc(m.host || '')}</div>${m.home ? brTeam(m.home, '<span class="tg">Home</span>') : brTbd('TBD')}${m.away ? brTeam(m.away) : brTbd('TBD')}</div></div>`; });
  b.quarterfinals.forEach((q, i) => { h += `<div class="br-c c2" style="grid-row:${i + 2}"><div class="card br-game"><div class="host">Quarterfinal · bowl site</div>${q.top ? brTeam(q.top, '<span class="tg bye">Bye</span>') : brTbd('TBD')}${brTbd(`Winner ${dim(q.from)}`)}</div></div>`; });
  const qlabel = (id) => { const q = b.quarterfinals.find((x) => x.id === id); return `${q.top ? esc(q.top.short) : '?'} vs ${dim(q.from)} winner`; };
  b.semifinals.forEach((sf, i) => { h += `<div class="br-c c3" style="grid-row:${i * 2 + 2} / span 2"><div class="card br-game"><div class="host">Semifinal ${i + 1}</div>${brTbd(qlabel(sf.from[0]))}${brTbd(qlabel(sf.from[1]))}</div></div>`; });
  h += `<div class="br-c c4" style="grid-row:2 / span 4"><div class="card br-game"><div class="host">Final</div>${brTbd('Winner of semifinal 1')}${brTbd('Winner of semifinal 2')}</div></div>`;
  return `<div class="br-scroll" tabindex="0" aria-label="Bracket, scroll sideways for later rounds"><div class="br-grid">${h}</div></div><p class="br-hint faint small">Swipe sideways for the quarterfinals, semifinals and final →</p>`;
}
function brFootnote(v, d) {
  const li = (t) => `<li>${t}</li>`;
  const fmt = d.format;
  return `<div class="card br-foot"><h3>How this bracket is built</h3><ul class="gk-how-list">
    ${li(`<b>Format (${esc(fmt.year)} season).</b> Automatic bids: the ACC, Big 12, Big Ten and SEC champions, plus the highest-ranked team from the American, C-USA, MAC, Mountain West, Pac-12 or Sun Belt, plus Notre Dame if it is ranked in the top 12. The next highest-ranked teams fill the field to 12.`)}
    ${li('<b>Seeding.</b> Seeds follow the ranking order, and the top 4 seeds get first-round byes. Since 2025 byes are no longer reserved for conference champions; an automatic qualifier ranked outside the top 12 takes the lowest seed(s).')}
    ${li('<b>Games.</b> First round: 5 v 12, 6 v 11, 7 v 10, 8 v 9, at the higher seed’s campus. Quarterfinals: 1 v 8/9, 2 v 7/10, 3 v 6/11, 4 v 5/12. Semifinals pair the 1/4 and 2/3 sides of the bracket; in 2026 the top three seeds choose their bowl path, so official bowl pairings can differ.')}
    ${li('<b>Projected champions.</b> No conference titles are decided yet. Each Power 4 conference’s projected champion is its highest-ranked team in this ranking (not the standings, no tiebreakers). The top Group of 6 team gets the fifth automatic bid whether or not it is a champion.')}
    ${li('<b>Only ranked teams.</b> Only teams in this Top 25 are considered. Nothing is estimated or filled in.')}
    ${v.id === 'cfp' ? li('<b>Official bracket.</b> The committee publishes a Top 25 each Tuesday in November; the official 12-team bracket is announced on Selection Day. Until then this applies the format to the committee’s latest ranking.') : ''}
    </ul><p class="faint small">Rules: <a href="${esc(fmt.sources[0].url)}" target="_blank" rel="noopener">CFP</a> · <a href="${esc(fmt.sources[1].url)}" target="_blank" rel="noopener">NCAA.com</a></p></div>`;
}
function brBody(v, d) {
  const when = (iso) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  const day = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  if (v.status === 'pending') {
    return `<div class="card br-empty"><div class="gk-kicker">Official CFP bracket</div><h2 class="br-big">Not released yet</h2><p>${esc(v.message)}</p>
      ${v.next ? `<p class="br-next"><b>Expected:</b> ${esc(day(v.next.date))}${v.next.time ? `, ${esc(v.next.time)} on ESPN` : ''}${v.next.note ? ` (${esc(v.next.note)})` : ''}.</p>` : ''}
      <details class="br-sched"><summary>All six release dates</summary><ul class="gk-how-list">${v.schedule.dates.map((x) => `<li><b>${esc(day(x.date))}</b> · ${esc(x.time)}${x.note ? ` · ${esc(x.note)}` : ''}</li>`).join('')}</ul></details>
      <p class="faint small">Dates: <a href="${esc(v.schedule.url)}" target="_blank" rel="noopener">${esc(v.schedule.source)}</a>. Checked live against ESPN’s rankings feed; nothing is shown until the committee ranks teams.</p></div>
      <p class="faint small">Meanwhile, see <a href="#/rankings/bracket/jt">your bracket</a> or the <a href="#/rankings/bracket/ap">AP projected bracket</a>.</p>`;
  }
  if (v.status !== 'ready') return `<div class="card empty">${esc(v.message || 'Not available right now.')}</div>`;
  const b = v.bracket; const sp = b.spotlight || {};
  const chip = (nm) => { const x = sp[nm]; return `<span class="br-spot ${x && x.inField ? 'in' : ''}"><b>${nm}</b> ${x && x.inField ? `No. ${x.seed} seed${x.bye ? ' · first-round bye' : ''}` : x && x.rank ? `No. ${x.rank}, outside the 12-team field` : 'not in this Top 25'}</span>`; };
  return `${v.mock ? '<div class="notice br-mock">TEST DATA: mocked CFP payload (local testing only)</div>' : ''}
    <div class="card br-head"><div class="gk-src"><span class="gk-tag grok">${esc(v.label)}</span>${v.id === 'cfp' ? '<span class="gk-tag live">Committee ranking</span>' : ''}</div>
      <p class="br-basis">${esc(v.basis)}</p>
      <div class="br-spots">${chip('Utah')}${chip('BYU')}</div>
      <p class="faint small">Source: ${esc(v.source.name)}${v.source.week ? ` · week ${esc(v.source.week)}` : ''}${v.source.date ? ` · ${esc(when(v.source.date))}` : ''}</p></div>
    ${brGrid(b)}
    <h2>The 12-team field</h2><div class="card br-list">${b.seeds.map((s) => `<div class="br-row ${myTeamIds().has(s.id) ? 'mine' : ''} ${SPOT_IDS.has(s.id) ? 'spot' : ''}" style="--tc:#${esc(s.color || '888')}"><span class="sd">${s.seed}</span><img src="${esc(logo(s))}" alt="" loading="lazy" /><span class="n"><b>${esc(s.short)}</b> <small>${s.record ? `${esc(s.record)} · ` : ''}No. ${s.rank} · ${esc(s.conference || '')}</small><small class="ty ${esc(s.type)}">${esc(BR_TYPE[s.type](s))}</small></span>${s.bye ? '<span class="tg bye">Bye</span>' : ''}</div>`).join('')}</div>
    ${b.out.length ? `<h2>First teams out</h2><div class="card br-list">${b.out.map((o) => `<div class="br-row out ${SPOT_IDS.has(o.id) ? 'spot' : ''}" style="--tc:#${esc(o.color || '888')}"><span class="sd">·</span><img src="${esc(logo(o))}" alt="" loading="lazy" /><span class="n"><b>${esc(o.short)}</b> <small>${o.record ? `${esc(o.record)} · ` : ''}No. ${o.rank}</small><small>${esc(o.reason)}</small></span></div>`).join('')}</div>` : ''}
    ${b.missingChampions && b.missingChampions.length ? `<p class="notice">No ranked team in: ${b.missingChampions.map(esc).join(', ')}, so that conference’s automatic bid isn’t shown.</p>` : ''}
    ${v.outlook ? `<div class="card nt br-outlook"><h3>JT’s own CFP outlook</h3><p>${esc(v.outlook)}</p><p class="gk-note">JT’s written outlook, copied as published. The bracket above is computed from the JT ranking with the current CFP rules, so the two can differ.</p></div>` : ''}
    ${brFootnote(v, d)}`;
}
const BR_TIMEOUT = 25000; // Render's free tier can take a while to wake up: show a loading state, then a clear error with Retry
const brError = (msg) => `<div class="card empty br-err" role="alert"><b>Couldn’t load the bracket.</b><p>${esc(msg)}</p><button class="btn" data-brretry="1">Try again</button></div>`;
async function viewBracket(quick) {
  const m = (location.hash || '').match(/^#\/rankings\/bracket\/?(jt|ap|cfp)?/); if (m) brView = m[1] || (quick ? brView : 'jt'); // entering from a button/promo always starts on My Bracket
  setBar('Playoff Bracket', { back: '#/rankings' });
  const head = LT('Playoff Bracket', '12-team College Football Playoff');
  if (!quick) paint(head + '<p class="faint small br-loading" role="status">Loading the bracket…</p>' + SK.rows(8));
  const retry = () => { mem.delete('/api/brackets'); viewBracket(false); };
  const showErr = (msg) => { view.innerHTML = head + brError(msg); const b = view.querySelector('[data-brretry]'); if (b) b.onclick = retry; };
  let d;
  try {
    d = await Promise.race([api('/api/brackets', 5 * 60e3), new Promise((_, rej) => setTimeout(() => rej(new Error('The server is taking too long to respond. It may be waking up; try again in a moment.')), BR_TIMEOUT))]);
  } catch (e) { showErr(e.message || 'Network error.'); return; }
  try {
    const tabs = [['jt', 'My Bracket'], ['ap', 'AP Projected'], ['cfp', 'Official CFP']];
    const v = d[brView] || d.jt || d.ap || d.cfp; if (!v) throw new Error('No bracket data came back.');
    view.innerHTML = LT('Playoff Bracket', `12-team College Football Playoff · ${esc(v.title)}`) +
      `<div class="toolbar sticky"><div class="seg br-seg" role="tablist">${tabs.map(([k, n]) => `<button role="tab" aria-selected="${k === v.id}" data-bv="${k}" class="${k === v.id ? 'on' : ''}">${n}${k === 'cfp' && d.cfp && d.cfp.status === 'pending' ? ' <i class="br-dot" aria-label="not released"></i>' : ''}</button>`).join('')}</div></div>
      ${brBody(v, d)}
      <p class="faint small">* Projected champion. Generated ${esc(new Date(d.generatedAt).toLocaleString())}. Rankings come from the JT Top 25 and ESPN’s rankings feed; nothing is stored or estimated.</p>`;
    view.querySelectorAll('[data-bv]').forEach((b) => (b.onclick = () => { tick(); brView = b.dataset.bv; history.replaceState(null, '', `#/rankings/bracket/${brView}`); viewBracket(true); }));
  } catch (e) { console.error(e); showErr(`Something went wrong showing it (${e.message}).`); }
}
// Short description + methodology. Only what is actually known about the automation: the 60/40 hybrid weights, the
// predictive definition and "no manual overrides" come from the weekly run's own method field; schedule, comparisons and
// bracket rules come from the app. Résumé sub-factors are not published by the automation, so they're left general.
const JT_ABOUT = 'Justin’s weekly college football ranking, rebuilt every Sunday morning from a hybrid score: 60% résumé and 40% predictive, with no manual overrides and no brand bias. Each team is shown next to its AP, Coaches and CFP ranking.';
async function viewGrokHow(quick) {
  setBar('How it’s calculated', { back: '#/rankings/grok' });
  if (!quick) paint(LT('How it’s calculated', SK.sub()) + SK.rows(6));
  let g = null; try { g = await api('/api/grok-top25', 10 * 60e3); } catch {}
  const m = g?.method || {};
  const pct = (w, d) => `${Math.round((typeof w === 'number' ? w : d) * 100)}%`;
  const R = pct(m.resumeWeight, 0.6); const Pd = pct(m.predictiveWeight, 0.4);
  const sec = (h, body) => `<div class="card gk-how-card"><h3>${h}</h3>${body}</div>`;
  view.innerHTML = `<div class="card gk-hero"><div class="gk-kicker">JT Top 25 · methodology</div><h1 class="gk-title">How it’s calculated</h1><p class="gk-about">${JT_ABOUT}</p></div>
    <div class="gk-split" role="img" aria-label="${R} résumé, ${Pd} predictive"><span class="r" style="flex:${parseInt(R)}">${R} résumé</span><span class="p" style="flex:${parseInt(Pd)}">${Pd} predictive</span></div>
    ${sec('The hybrid score', `<ul class="gk-how-list">
      <li><b>${R} résumé.</b> Résumé points for what a team has actually done on the field this season.</li>
      <li><b>${Pd} predictive.</b> The average of the team’s SP+ and FPI ranks, a measure of how strong the team is going forward.</li>
      <li><b>No manual overrides.</b> The order is the score, with no brand bias.</li></ul>`)}
    ${sec('When it updates', '<p>A new ranking is built every Sunday morning (8:00 AM Mountain), after the weekend’s results. Earlier weeks stay available from the week picker.</p>')}
    ${sec('How it’s compared', '<p>Every JT spot is shown next to the AP poll, the Coaches poll and the College Football Playoff rankings. Those numbers are pulled live from ESPN and never estimated. CFP numbers appear once the committee releases its rankings.</p>')}
    ${sec('The projected bracket', `<p>The Bracket tab applies the current 12-team CFP format to the JT order:</p><ul class="gk-how-list">
      <li>Automatic bids: the ACC, Big 12, Big Ten and SEC champions, the highest-ranked Group of 6 team, and Notre Dame if it is in the top 12. The next highest-ranked teams fill out the 12.</li>
      <li>Seeds follow the ranking order, and the top 4 seeds get first-round byes.</li>
      <li>Seeds 5–12 play in the first round at the higher seed’s campus.</li>
      <li>Each conference’s projected champion is its highest JT-ranked team.</li></ul>`)}
    ${m.note ? sec('This week’s method note', `<p class="muted">${esc(m.note)}</p>`) : ''}
    <a class="btn" href="#/rankings/grok">Back to JT Top 25</a>`;
}
async function viewGrok(quick) {
  setBar('JT Top 25', { back: '#/rankings' });
  if (!quick) paint(LT('JT Top 25', SK.sub()) + SK.rows(12));
  let g; try { g = await api(`/api/grok-top25${grokDate ? `?date=${grokDate}` : ''}`, 10 * 60e3); } catch (e) { view.innerHTML = LT('JT Top 25') + errBox(e); return; }
  const lp = g.livePolls || {}; const my = myTeamIds();
  const P = (n, v, cfp) => `<span>${n} <b>${v || (cfp && !lp.cfpReleased ? '—' : 'NR')}</b></span>`;
  const mv = (r) => r.move === 'new' ? '<span class="mv new">New</span>' : r.move == null ? '' : `<span class="mv ${r.move > 0 ? 'up' : r.move < 0 ? 'dn' : 'eq'}">${r.move ? (r.move > 0 ? '▲' + r.move : '▼' + -r.move) : '–'}</span>`;
  let body = '';
  if (grokTab === 'top') {
    body = `<div class="card gk-list">${g.ranks.map((r) => `<a class="gk-row ${my.has(r.info?.id) ? 'mine' : ''}" href="${r.info ? `#/schedule/${esc(r.info.id)}` : '#/rankings/grok'}" style="--tc:#${esc(r.info?.color || '888')}"><span class="gk-rank">${r.rank}</span><img src="${esc(gLogo(r.info))}" alt="" loading="lazy" />
      <span class="gk-nm"><b>${esc(gName(r))}</b><span class="rec">${esc(r.record)} · ${esc(r.conference || '')}</span> ${mv(r)}<div class="gk-why">${esc(r.reason || '')}</div></span>
      <span class="gk-polls">${P('AP', r.live?.ap)}${P('Coaches', r.live?.coaches)}${P('CFP', r.live?.cfp, true)}</span></a>`).join('')}</div>
      ${g.justMissed?.length ? `<h2>Just missed</h2><p class="muted small">${g.justMissed.map((j) => j.info ? `<a href="#/team/${esc(j.info.id)}">${esc(j.info.short)}</a>` : esc(j.team)).join(' · ')}</p>` : ''}
      ${g.droppedOut?.length ? `<h2>Dropped out</h2><p class="muted small">${g.droppedOut.map((x) => esc(x.team || x)).join(' · ')}</p>` : ''}`;
  } else if (grokTab === 'chart') body = grokChart(g, lp);
  else {
    const n = g.notes || {};
    const box = (t, v) => `<div class="card nt"><h3>${t}</h3><p class="${v ? '' : 'na'}">${v ? esc(v) : 'Not included in this week’s JT output.'}</p></div>`;
    const same = n.risersFallers && n.apVsGrok && n.risersFallers.trim() === n.apVsGrok.trim();
    body = `<div class="gk-notes">${same ? box('Risers & fallers · AP vs JT', n.risersFallers) : box('Risers & fallers', n.risersFallers) + box('AP vs JT', n.apVsGrok)}${box('What to watch next week', n.nextWeek)}${box('JT’s CFP outlook', n.cfpOutlook)}${n.cfpOutlook ? '<p class="gk-note">This is JT’s own outlook text. The Bracket tab is computed separately from the JT order using the 5+7 format.</p>' : ''}</div>
      ${(g.apTop5 || []).length ? `<h2>AP top 5 this week</h2><div class="card panel">${g.apTop5.map((a) => `<div class="rank-row"><span class="n">${a.rank}</span><img src="${esc(gLogo(a.info))}" alt="" loading="lazy" /><span><b>${esc(gName(a))}</b></span></div>`).join('')}</div>` : ''}`;
  }
  const hist = (g.history || []).slice().reverse();
  view.innerHTML = `<div class="card gk-hero"><div class="gk-kicker">Week ${esc(g.week)} · ${new Date(g.date + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div><h1 class="gk-title">JT Top 25</h1>
      <p class="gk-about">${JT_ABOUT}</p>
      <a class="gk-how" href="#/rankings/grok/how">How it’s calculated <span aria-hidden="true">→</span></a>
      <div class="gk-src"><span class="gk-tag grok">JT order</span><span class="gk-tag live">Live AP · Coaches${lp.cfpReleased ? ' · CFP' : ''} from ESPN</span>${lp.cfpReleased ? '' : '<span class="gk-tag">CFP rankings: not released</span>'}</div></div>
    <div class="gk-sub"><div class="seg">${[['top', 'Top 25'], ['chart', 'Compare'], ['bracket', 'Bracket'], ['notes', 'Notes']].map(([k, n]) => `<button data-gt="${k}" class="${k === grokTab ? 'on' : ''}">${n}</button>`).join('')}</div>
      ${hist.length > 1 ? `<select id="gdate" class="btn" aria-label="Week">${hist.map((d) => `<option value="${d}" ${d === g.date ? 'selected' : ''}>${d}</option>`).join('')}</select>` : ''}</div>
    ${body}
    <p class="faint small">JT order from your weekly automation (data/grok-top25). AP, Coaches and CFP numbers are pulled live from ESPN and never estimated.</p>`;
  view.querySelectorAll('[data-gt]').forEach((b) => (b.onclick = () => { tick(); if (b.dataset.gt === 'bracket') { location.hash = '#/rankings/bracket/jt'; return; } grokTab = b.dataset.gt; viewGrok(true); }));
  const sel = $('#gdate'); if (sel) sel.onchange = () => { grokDate = sel.value === hist[0] ? '' : sel.value; viewGrok(true); };
}

// ---------------- Gamecast ----------------
const myProviders = () => (S.watch && S.watch.providers) || [];
const watchHTML = (ev, opts) => watchButtons(ev, myProviders(), opts);
const castCtx = () => { const mf = muteFilter(); return { logo, follows, muted: (id) => mf.teamId(id), watch: watchHTML }; };
let castLive = false;
async function viewGame(sp, id, quick) {
  if (castState.sport !== sp || castState.id !== id) { const keep = castState.player; Object.assign(castState, { tab: 'summary', player: sp === 'golf' ? keep : null, sport: sp, id, fp: null, fd: null, ab: null, sf: 'all' }); }
  setBar('Gamecast', { back: `#/${lastTab}` });
  if (!quick) paint(`<div class="card gc-head"><div class="sk w30 sm"></div><div class="sk w70"></div><div class="sk w50 sm"></div></div>${SK.games(1)}${SK.rows(8)}`);
  let d; try { d = await api(`/api/game/${sp}/${id}`, 10e3); } catch (e) { view.innerHTML = errBox(e); return; }
  if (!location.hash.startsWith(`#/game/${sp}/${id}`)) return;
  setBar(castTitle(d), { back: `#/${lastTab}` });
  const y = window.scrollY;
  gameBackdrop(sp, d);
  // Animation mode: 'load' (first open / tab change: everything plays), 'select' (user picked a play/drive/filter: that card plays),
  // 'refresh' (10s live poll: only cards that changed are patched and only brand-new plays/pitches/shots animate).
  const mode = castState.mode || (quick ? 'refresh' : 'load'); castState.mode = null;
  GA.mountCast(view, `gc gc-${d.kind}`, renderGamecast(d, castCtx()), `${sp}:${id}`, mode);
  if (quick) window.scrollTo(0, y);
  castLive = d.state === 'in';
  scheduleRefresh(castLive, 10e3);
}

function gameBackdrop(sp, d) {
  try {
    if (d.home && d.away && d.home.team && d.away.team) {
      const T = (x) => ({ ...(teamById(x.team.id) || {}), ...x.team, logo: logo(x.team) });
      return BD.setGame(T(d.away), T(d.home), sp);
    }
    if (d.kind === 'golf') {
      const pick = (d.players || []).find((p) => p.id === castState.player) || (d.players || []).find((p) => follows(p.id)) || (d.players || [])[0];
      return BD.setPlayers(sp, pick ? [pick.flag] : []);
    }
    if (d.kind === 'tennis') return BD.setPlayers(sp, (d.players || []).map((p) => p.flag));
    if (d.kind === 'event') {
      const c = (d.comps || []).find((x) => x.id === castState.player) || (d.comps || []).find((x) => x.state === 'in') || (d.comps || [])[0];
      const cs = c ? c.competitors.slice().sort((a, b) => (follows(b.id) - follows(a.id)) || ((a.order || 99) - (b.order || 99))) : [];
      return BD.setPlayers(sp, cs.slice(0, d.family === 'mma' ? 2 : 1).map((x) => x.headshot || x.flag));
    }
    BD.setSport(sp);
  } catch { BD.setSport(sp); }
}
const UNIT = (sp) => ({ baseball: 'Runs', soccer: 'Goals', hockey: 'Goals' }[(SPORTS[sp] || {}).family] || 'Points');
let teamTab = 'schedule'; let teamTabFor = ''; let schedAll = { up: false, past: false };
const TEAM_TABS = [['schedule', 'Schedule'], ['stats', 'Stats'], ['news', 'News'], ['roster', 'Roster']];
async function viewSchedule(id) { return viewTeam(id, 'schedule'); } // #/schedule/<id> = the team page, opened on its Schedule tab
async function viewTeam(id, forceTab) {
  await ensureTeams(sportOfId(id));
  const meta = teamById(id) || {}; const sp = meta.sport || sportOfId(id);
  if (teamTabFor !== id) { teamTabFor = id; teamTab = 'schedule'; schedAll = { up: false, past: false }; }
  if (forceTab) teamTab = forceTab;
  const here = () => /^#\/(team|schedule)\//.test(location.hash);
  const back = HIST.length > 1 ? HIST[HIST.length - 2] : `#/${lastTab}`;
  setBar(meta.short || 'Team', { back });
  teamTheme(meta);
  paint(`<div class="card team-hero" style="--team:#${esc(meta.color || '1f6f5c')}">${meta.logo ? `<img src="${esc(logo(meta))}" alt="" />` : '<span class="sk logo big"></span>'}<div><h1>${esc(meta.name || '')}</h1><div class="sk w30 sm"></div></div></div>
    <div class="toolbar sticky"><div class="seg">${TEAM_TABS.map(([k, l]) => `<button class="${k === teamTab ? 'on' : ''}" disabled>${l}</button>`).join('')}</div></div>${SK.rows(8)}`);
  let d; try { d = await api(`/api/team/${id}`, 2 * 60e3); } catch (e) { view.innerHTML = errBox(e); return; }
  const t = d.team;
  if (!here()) return;
  teamTheme({ ...meta, ...t });
  BD.setTeam({ ...meta, ...t, logo: logo(t.logo ? t : meta) }, sp);
  setBar(t.name, { back });
  const following = S.follow.includes(t.id); const muted = S.muteTeams.includes(t.id);
  const roster = d.roster || [];
  const tabs = TEAM_TABS.filter(([k]) => k !== 'roster' || roster.length);
  if (!tabs.some(([k]) => k === teamTab)) teamTab = 'schedule';
  const summary = (t.record && t.record[0] && t.record[0].summary) || '';
  const recs = t.record.map((r) => `<div class="card"><div class="v">${esc(r.summary)}</div><div class="l">${esc(r.desc || r.name || 'Record')}</div></div>`).join('');
  const statsHTML = () => `<h2>Record & scoring</h2><div class="kv">${recs}${meta.confRecord ? `<div class="card"><div class="v">${esc(meta.confRecord)}</div><div class="l">Conference</div></div>` : ''}
      ${t.ppg != null ? `<div class="card"><div class="v">${(+t.ppg).toFixed(1)}</div><div class="l">${UNIT(sp)} per game</div></div>` : ''}
      ${t.oppg != null ? `<div class="card"><div class="v">${(+t.oppg).toFixed(1)}</div><div class="l">${UNIT(sp)} allowed / game</div></div>` : ''}
      ${meta.streak ? `<div class="card"><div class="v">${esc(meta.streak)}</div><div class="l">Streak</div></div>` : ''}</div>
    <h2>Season stats</h2><div class="stat-groups">${d.stats.map((g) => `<div class="card"><h4>${esc(g.name)}</h4>${g.items.map((s) => `<div class="r"><span>${esc(s.label)}</span><b>${esc(s.value)}</b></div>`).join('')}</div>`).join('') || `<div class="empty">${sp === 'mlb' ? 'Season stats aren’t in ESPN’s free MLB team feed.' : 'No season stats in ESPN’s free feed yet.'}</div>`}</div>`;
  const rosterHTML = () => `<h2>Roster <span class="count">${roster.length} · ★ to follow a player</span></h2><div class="card panel roster">${roster.map((p) => `<div class="ro-row ${follows(p.id) ? 'mine' : ''}">${p.headshot ? `<img class="hs" src="${esc(p.headshot)}" alt="" loading="lazy" />` : '<span class="hs"></span>'}<a class="nm" href="#/player/${esc(p.id)}"><b>${esc(p.name)}</b> <span class="faint small">${esc([p.jersey ? '#' + p.jersey : '', p.pos].filter(Boolean).join(' · '))}</span></a><button class="pf ${follows(p.id) ? 'on' : ''}" data-pfollow="${esc(p.id)}" data-pname="${esc(p.name)}" data-pflag="${esc(p.headshot || '')}" data-pteam="${esc(t.id)}" data-ppos="${esc(p.pos || '')}" aria-pressed="${follows(p.id)}" aria-label="${follows(p.id) ? 'Unfollow' : 'Follow'} ${esc(p.name)}">${follows(p.id) ? '★' : '☆'}</button></div>`).join('')}</div>`;
  view.innerHTML = `<div class="team-page"><div class="card team-hero" style="--team:#${esc(t.color || '1f6f5c')}"><img src="${esc(logo(t))}" alt="" />
      <div><h1>${esc(t.name)}</h1><div class="muted">${[summary, t.standing, meta.conference].filter(Boolean).map(esc).join(' · ')}</div></div>
      <div class="actions"><button class="btn ${following ? 'primary' : ''}" id="fol">${following ? '✓ Following' : '+ Follow'}</button><button class="btn ${muted ? 'danger' : ''}" id="mut">${muted ? 'Muted' : 'Mute'}</button></div></div>
    <div class="toolbar sticky team-tabs"><div class="seg" role="tablist">${tabs.map(([k, l]) => `<button data-ttab="${k}" class="${teamTab === k ? 'on' : ''}" role="tab" aria-selected="${teamTab === k}">${l}</button>`).join('')}</div></div>
    <div id="team-body"></div></div>`;
  $('#fol').onclick = () => { tick(); S.follow = following ? S.follow.filter((x) => x !== t.id) : [...S.follow, t.id]; if (!following) S.muteTeams = S.muteTeams.filter((x) => x !== t.id); save(); toast(following ? `Unfollowed ${t.name}` : `Following ${t.name}`); SILENT = true; viewTeam(id).finally(() => (SILENT = false)); };
  $('#mut').onclick = () => { tick(); S.muteTeams = muted ? S.muteTeams.filter((x) => x !== t.id) : [...S.muteTeams, t.id]; if (!muted) S.follow = S.follow.filter((x) => x !== t.id); save(); toast(muted ? `Unmuted ${t.name}` : `Muted ${t.name}`); SILENT = true; viewTeam(id).finally(() => (SILENT = false)); };
  const body = $('#team-body');
  // --- tabs: switching never refetches the team, and keeps the URL honest (#/team/<id>) ---
  view.querySelectorAll('[data-ttab]').forEach((b) => (b.onclick = () => { tick(); teamTab = b.dataset.ttab; if (location.hash.startsWith('#/schedule/')) history.replaceState(null, '', `#/team/${id}`); view.querySelectorAll('[data-ttab]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); }); paintTab(); scrollTo(0, Math.min(scrollY, 0)); }));
  const loadSched = async () => {
    let sd; try { sd = await api(`/api/schedule/team/${encodeURIComponent(id)}`, 2 * 60e3); } catch (e) { sd = null; }
    if (!here() || teamTab !== 'schedule' || !$('#team-sched')) return;
    if (!sd || !sd.events) { // fall back to the (ticket-less) list that came with the team feed
      const rows = (d.schedule || []).map((ev) => schedItemLite(ev, t, sp)).join('');
      $('#team-sched').innerHTML = `<div class="notice">Couldn’t load the full schedule just now — showing the basic list.</div><div class="card panel">${rows || '<div class="empty">No schedule on ESPN yet.</div>'}</div>`;
      return;
    }
    const y = scrollY;
    $('#team-sched').innerHTML = `${scheduleSections(sd.events, t.id, sd.sport || sp, peopleCtx(), { limitUp: schedAll.up ? 0 : 12, limitPast: schedAll.past ? 0 : 12 })}
      <p class="faint small">${sd.season ? `${esc(sd.season)} season · ` : ''}Schedule, scores and TV from ESPN. Ticket links go to the game’s SeatGeek page${sd.ticketsPriced ? '; prices appear when SeatGeek publishes them' : ''}.</p>`;
    if (SILENT) scrollTo(0, y);
    $('#team-sched').querySelectorAll('[data-more]').forEach((b) => (b.onclick = () => { tick(); schedAll[b.dataset.more] = true; loadSched(); }));
    scheduleRefresh(sd.events.some((e) => e.state === 'in'), 30e3);
  };
  const loadNews = async () => {
    try {
      const n = await api(newsPath(t.id, sp), 5 * 60e3);
      if (!$('#team-news')) return;
      const m = teamMatcher(meta.id ? meta : t, TEAMS, sp);
      const { items } = filterNews(n.items);
      const mine = items.filter((i) => m(itemText(i))).slice(0, 15);
      $('#team-news').innerHTML = `<div class="card panel news-list">${mine.map(newsItem).join('') || `<div class="empty">${muted ? 'This team is muted, so its news is hidden.' : 'No recent straight-news stories.'}</div>`}</div>`;
    } catch (e) { if ($('#team-news')) $('#team-news').innerHTML = errBox(e); }
  };
  function paintTab() {
    if (teamTab !== 'schedule') scheduleRefresh(false);
    if (teamTab === 'schedule') { body.innerHTML = `<div id="team-sched">${SK.rows(6)}</div>`; loadSched(); }
    else if (teamTab === 'stats') body.innerHTML = statsHTML();
    else if (teamTab === 'news') { body.innerHTML = `<h2>Latest news</h2><div id="team-news">${SK.news(4)}</div>`; loadNews(); }
    else body.innerHTML = rosterHTML();
  }
  paintTab();
}
// bare-bones schedule row, only used if /api/schedule/team can't be reached
function schedItemLite(ev, t, sp) {
  const home = ev.home.team?.id === t.id; const me = home ? ev.home : ev.away; const opp = home ? ev.away : ev.home;
  let res = '';
  if (ev.state === 'post') res = `<span class="res ${me.winner ? 'W' : 'L'}">${me.winner ? 'W' : 'L'} ${esc(me.score)}–${esc(opp.score)}</span>`;
  else if (ev.state === 'in') res = `<span class="res" style="color:var(--live)">LIVE ${esc(me.score)}–${esc(opp.score)}</span>`;
  else res = `<span class="faint small">${/TBD/.test(ev.detail) ? 'TBD' : new Date(ev.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>`;
  return `<a class="sched-row" href="#/game/${sp}/${esc(ev.id)}"><span class="faint small">${new Date(ev.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
    <span class="opp"><span class="faint small">${home ? 'vs' : '@'}</span><img src="${esc(logo(opp.team))}" alt="" loading="lazy" />${opp.rank ? `<span class="faint small">${opp.rank}</span>` : ''}<span>${esc(opp.team?.short || 'TBD')}</span></span>${res}</a>`;
}

// ---------------- schedule + player pages ----------------
const peopleCtx = () => ({ logo, watch: watchHTML, follows,
  followBtn: (x) => (x.kind && x.kind !== 'team' ? '' : '') + (isAthleteId(x.id) || /^(golf|tennis):/.test(x.id)
    ? `<button class="btn ${follows(x.id) ? 'primary' : ''}" data-pfollow="${esc(x.id)}" data-pname="${esc(x.name)}" data-pflag="${esc(x.headshot || x.flag || '')}" data-pteam="${esc((x.team && x.team.id) || '')}" data-ppos="${esc(x.pos || '')}">${follows(x.id) ? '✓ Following' : '+ Follow'}</button>`
    : `<button class="btn ${follows(x.id) ? 'primary' : ''}" data-sfollow="${esc(x.id)}" data-sname="${esc(x.name)}">${follows(x.id) ? '✓ Following' : '+ Follow'}</button>`) });
function bindSched() {
  view.onclick = (e) => {
    const f = e.target.closest('[data-sfollow]');
    if (f) { tick(); const id = f.dataset.sfollow; const on = follows(id); S.follow = toggle(S.follow, id); if (!on) S.muteTeams = S.muteTeams.filter((x) => x !== id); save(); toast(on ? `Unfollowed ${f.dataset.sname}` : `Following ${f.dataset.sname}`); route(true); return; }
    const tr = e.target.closest('tr[data-href]'); if (tr && !e.target.closest('a')) { location.hash = tr.dataset.href; return; }
    const pt = e.target.closest('[data-ptab]'); if (pt) { tick(); playerTab = pt.dataset.ptab; renderPlayer(); }
  };
}
let playerTab = null; let PLAYER = null; let PSCHED = null;
function renderPlayer() {
  const p = PLAYER; if (!p) return;
  const tabs = playerTabs(p); if (!tabs.some(([k]) => k === playerTab)) playerTab = tabs[0][0];
  const y = scrollY;
  view.innerHTML = `<div class="player-page">${playerHero(p, peopleCtx())}
    <div class="toolbar sticky"><div class="seg" role="tablist">${tabs.map(([k, l]) => `<button data-ptab="${k}" class="${playerTab === k ? 'on' : ''}" role="tab" aria-selected="${playerTab === k}">${l}</button>`).join('')}</div></div>
    ${playerBody(p, playerTab, peopleCtx(), PSCHED)}
    <p class="faint small">Player data from ESPN${p.link ? ` · <a href="${esc(p.link)}" target="_blank" rel="noopener">ESPN player card ↗</a>` : ''}.</p></div>`;
  scrollTo(0, y);
  bindSched();
}
async function viewPlayer(id) {
  const known = S.players[id] || {};
  if (!PLAYER || PLAYER.id !== id) { PLAYER = null; PSCHED = null; playerTab = null; }
  setBar(known.short || known.name || 'Player', { back: HIST.length > 1 ? HIST[HIST.length - 2] : `#/${lastTab}` });
  if (!PLAYER) paint(`<div class="card team-hero"><span class="sk logo big"></span><div><div class="sk w50"></div><div class="sk w30 sm"></div></div></div>${SK.rows(8)}`);
  let p; try { p = await api(`/api/player/${encodeURIComponent(id)}`, 5 * 60e3); } catch (e) { view.innerHTML = errBox(e); return; }
  if (!location.hash.startsWith('#/player/')) return;
  teamTheme(p.team ? { ...(teamById(p.team.id) || {}), ...p.team } : null);
  PLAYER = p; setBar(p.short || p.name, { back: HIST.length > 1 ? HIST[HIST.length - 2] : `#/${lastTab}` });
  if (p.team) BD.setTeam({ ...(teamById(p.team.id) || {}), ...p.team, logo: logo(p.team) }, p.sport); else BD.setPlayers(p.sport, [p.headshot || p.flag].filter(Boolean));
  renderPlayer();
  if (p.team && !PSCHED) {
    try { PSCHED = await api(`/api/schedule/team/${encodeURIComponent(p.team.id)}`, 2 * 60e3); } catch (e) { PSCHED = { error: e.message }; }
    if (location.hash.startsWith('#/player/') && PLAYER === p && playerTab === 'schedule') renderPlayer();
  }
}

// ---------------- preference pickers (shared by onboarding + settings sub-screens) ----------------
let teamQ = ''; let teamConf = ''; let muteQ = ''; let pickAll = true; let pickBy = 'az'; let pickOpen = null; let pickSport = null; let pickMode = 'teams'; let browseTeam = '';
const ATH = new Map(); const ROSTER = new Map(); let athTimer = 0;
const pickRoot = () => document.querySelector('#onb') || view;
const regrid = () => { const g = $('[data-part="grid"]', pickRoot()); if (g) g.innerHTML = partHTML('grid'); };
function searchAthletes(sp, q) { // debounced ESPN athlete search (free public endpoint)
  const k = `${sp}|${q.toLowerCase()}`; if (ATH.has(k)) return ATH.get(k);
  clearTimeout(athTimer);
  athTimer = setTimeout(async () => {
    ATH.set(k, 'loading');
    try { ATH.set(k, await api(`/api/athletes?sport=${sp}&q=${encodeURIComponent(q)}`, 10 * 60e3)); } catch { ATH.set(k, []); }
    if (pSport() === sp && teamQ.trim().toLowerCase() === q.toLowerCase()) regrid();
  }, 280);
  return 'loading';
}
async function loadRoster(id) {
  if (ROSTER.has(id)) return; ROSTER.set(id, 'loading');
  try { ROSTER.set(id, await api(`/api/roster/${encodeURIComponent(id)}`, 36e5)); } catch { ROSTER.set(id, []); }
  if (browseTeam === id) regrid();
}
const playerRow = (p, sub) => `<button class="pick-row ${follows(p.id) ? 'on' : ''}" data-tfollow="${esc(p.id)}" data-pname="${esc(p.name)}" data-pflag="${esc(p.headshot || p.flag || '')}" data-pteam="${esc(p.teamId || '')}" data-ppos="${esc(p.pos || '')}" aria-pressed="${follows(p.id)}"><img src="${esc(p.headshot || p.flag || '')}" alt="" class="${p.headshot ? 'hs' : 'flag'}" loading="lazy" /><span class="nm"><b>${esc(p.name)}</b><small>${sub}</small></span>${CHECK}</button>${/^(golf|tennis):|:a\d/.test(p.id) ? `<a class="pick-go" href="#/player/${esc(p.id)}" aria-label="${esc(p.name)} stats and schedule" title="Stats & schedule">›</a>` : ''}`;
const pSport = () => (pickSport && S.sports.includes(pickSport) ? pickSport : (pickSport = S.sports[0] || 'cfb'));
const UTAH = () => ['BYU', 'Utah', 'Utah State'].map((l) => TEAMS_BY.cfb.find((t) => t.location === l)).filter(Boolean);
async function loadPlayers(sp, root) {
  if (PLAYERS_BY[sp] || loadPlayers[sp]) return; loadPlayers[sp] = 1;
  try { PLAYERS_BY[sp] = await api(`/api/players/${sp}`, 36e5); } catch { PLAYERS_BY[sp] = []; }
  loadPlayers[sp] = 0; if (root) refreshParts(root, []);
}
const KW_SUGGEST = ['Transfer portal', 'Odds', 'Fantasy', 'Mock draft'];
const OUTLET_SUGGEST = ['ESPN', 'Bleacher Report', 'Barstool', 'OutKick'];
const CHECK = '<span class="check" aria-hidden="true"></span>';
const teamSportIds = () => S.sports.filter(teamSport);
const allMode = () => pickAll && pickMode === 'teams' && teamSportIds().length > 1;
const pickRow = (t, f) => `<button class="pick-row ${f(t.id) ? 'on' : ''}" data-tfollow="${t.id}" aria-pressed="${f(t.id)}"><img src="${esc(logo(t))}" alt="" loading="lazy" /><span class="nm"><b>${esc(fullName(t))}</b><small>${esc([t.abbr, t.conference].filter(Boolean).join(' · '))}</small></span>${CHECK}</button>`;
function teamRows(teams, f) {
  if (pickBy !== 'conf') return teams.map((t) => pickRow(t, f)).join('');
  return subGroups(teams).map((g) => (g.name ? `<div class="sub-head">${esc(g.name)}</div>` : '') + g.teams.map((t) => pickRow(t, f)).join('')).join('');
}
const lgMeta = (g, q) => `${q ? `${g.teams.length} of ${g.total}` : `${g.total || ''} teams`.trim()}${g.followed ? ` · ${g.followed} following` : ''}`;
function allGrid(f, q) { // every league you picked, collapsible, each sorted location-first
  const groups = buildGroups({ sportIds: S.sports, isTeam: teamSport, sports: SPORTS, teamsBy: TEAMS_BY, followedIn: (sp) => followsIn(sp).filter((id) => !isAthleteId(id)).length, q, conf: '' });
  if (pickOpen === null) pickOpen = new Set(groups.length ? [groups[0].sport] : []);
  const searching = q.length >= 1;
  const need = groups.filter((g) => !g.loaded && (searching || pickOpen.has(g.sport)));
  if (need.length) Promise.all(need.map((g) => ensureTeams(g.sport))).then(() => { const gr = $('[data-part="grid"]', pickRoot()); if (gr && allMode()) gr.innerHTML = partHTML('grid'); });
  const out = groups.map((g) => {
    if (searching && g.loaded && !g.teams.length) return '';
    const open = searching ? true : pickOpen.has(g.sport);
    const meta = g.loaded ? lgMeta(g, searching) : (g.followed ? `${g.followed} following` : 'tap to load');
    return `<div class="lg" data-lg="${g.sport}"><button class="lg-head" data-lghead="${g.sport}" aria-expanded="${open}"><span class="em">${SPORTS[g.sport].emoji}</span><span class="nm"><b>${esc(g.label)}</b><small data-total="${g.total}">${esc(meta)}</small></span><span class="chev" aria-hidden="true"></span></button>${open ? `<div class="lg-body">${g.loaded ? teamRows(g.teams, f) : '<div class="empty small">Loading teams…</div>'}</div>` : ''}</div>`;
  }).join('');
  return out || '<div class="empty">No teams match.</div>';
}
function syncGroupCounts(root) { // follow toggles update league headers without re-rendering (keeps scroll position)
  root.querySelectorAll('[data-lghead]').forEach((h) => {
    const sp = h.dataset.lghead; const n = followsIn(sp).filter((id) => !isAthleteId(id)).length; const sm = $('small', h); if (!sm) return;
    const base = sm.textContent.replace(/\s*·\s*\d+ following$/, '').replace(/^\d+ following$/, '').trim();
    sm.textContent = base ? (n ? `${base} · ${n} following` : base) : (n ? `${n} following` : '');
  });
}
const mascot = (t) => (t.name.startsWith(t.location) ? t.name.slice(t.location.length).trim() : t.name);

function partHTML(p) {
  const f = (id) => S.follow.includes(id);
  switch (p) {
    case 'sportseg': return S.sports.length > 1 ? `<div class="chips sport-chips">${teamSportIds().length > 1 ? `<button class="chip lg ${allMode() ? 'on' : ''}" data-psport="all" aria-pressed="${allMode()}">🏟️ All leagues<span class="cnt">${S.follow.filter((id) => !isAthleteId(id) && teamSport(sportOfId(id))).length || ''}</span></button>` : ''}${S.sports.map((k) => `<button class="chip lg ${!allMode() && k === pSport() ? 'on' : ''}" data-psport="${k}">${SPORTS[k].emoji} ${esc(SPORTS[k].short)}<span class="cnt">${followsIn(k).length || ''}</span></button>`).join('')}</div>` : '';
    case 'sports': return (S.sportsChosen ? '<div class="sports-note"><button class="btn small" data-allsports="1">Show all sports</button></div>' : '<p class="sports-note faint small">Showing every sport until you pick some. Tap a sport to show only the ones you choose.</p>') + SPORT_GROUPS.map((g) => { const ks = SPORT_IDS.filter((k) => SPORTS[k].group === g); return ks.length ? `<div class="group-lbl tiles-lbl">${esc(g)}</div>${ks.map((k) => { const on = S.sports.includes(k); const v = SPORTS[k]; return `<button class="tile sport ${on ? 'on' : ''}" data-sport="${k}" aria-pressed="${on}" style="--sa:${v.accent}"><span class="em">${v.emoji}</span><span><b>${esc(v.name)}</b><small>${esc(v.blurb || '')}${v.kind === 'news' ? ' · headlines only' : ''}</small></span>${CHECK}</button>`; }).join('')}` : ''; }).join('');
    case 'pmode': { const sp = pSport(); if (allMode() || !teamSport(sp)) return '';
      return `<div class="seg pmode"><button data-pmode="teams" class="${pickMode === 'teams' ? 'on' : ''}" aria-pressed="${pickMode === 'teams'}">Teams</button><button data-pmode="players" class="${pickMode === 'players' ? 'on' : ''}" aria-pressed="${pickMode === 'players'}">Players</button></div>`; }
    case 'quicklbl': return (allMode() ? S.sports.includes('cfb') : pSport() === 'cfb') && TEAMS_BY.cfb && UTAH().length ? 'Popular in Utah' : '';
    case 'quick': if (!(allMode() ? S.sports.includes('cfb') : pSport() === 'cfb') || !TEAMS_BY.cfb) return ''; return UTAH().map((t) => `<button class="chip lg ${f(t.id) ? 'on' : ''}" data-tfollow="${t.id}" aria-pressed="${f(t.id)}"><img src="${esc(logo(t))}" alt="" />${esc(fullName(t))}${f(t.id) ? ' ✓' : ''}</button>`).join('');
    case 'followed': {
      const sp = pSport(); const l = (allMode() ? S.follow.filter((id) => !isAthleteId(id) && S.sports.includes(sportOfId(id))) : followsIn(sp)).map(teamById).filter(Boolean);
      return l.length ? l.map((t) => `<button class="chip on" data-tfollow="${t.id}"><img src="${esc(logo(t))}" alt="" class="${t.player ? (teamSport(sp) || eventSport(sp) ? 'hs' : 'flag') : ''}" />${t.player && teamSport(sp) ? '★ ' : ''}${esc(t.player ? t.short : fullName(t))} <span class="x">✕</span></button>`).join('') : `<span class="faint small">None yet — that’s fine, you’ll see ${sp === 'cfb' ? 'all of FBS' : `all of ${esc(SPORTS[sp].short)}`}.</span>`;
    }
    case 'followcount': { const n = allMode() ? S.follow.filter((id) => !isAthleteId(id) && S.sports.includes(sportOfId(id))).length : followsIn(pSport()).length; return n ? `· ${n}` : ''; }
    case 'tsearch': { const sp = pSport();
      if (newsSport(sp)) return '';
      if (teamSport(sp) && !TEAMS_BY[sp]) { ensureTeams(sp).then(() => refreshParts(pickRoot())); }
      if (teamSport(sp) && pickMode === 'players') {
        const TL = (TEAMS_BY[sp] || []).filter((t) => !teamConf || t.conferenceId === teamConf);
        return `<input class="search" data-in="tsearch" type="search" placeholder="Search ${esc(SPORTS[sp].short)} players by name" value="${esc(teamQ)}" autocomplete="off" enterkeyhint="search" /><div class="pick-sel">${confSelect()}<select class="btn" data-in="bteam" aria-label="Team roster"><option value="">Browse a roster…</option>${TL.map((t) => `<option value="${t.id}" ${browseTeam === t.id ? 'selected' : ''}>${esc(t.short)}</option>`).join('')}</select></div>`;
      }
      if (allMode()) return `<input class="search" data-in="tsearch" type="search" placeholder="Search teams in ${teamSportIds().length} leagues, e.g. Boston or Red Sox" value="${esc(teamQ)}" autocomplete="off" enterkeyhint="search" /><div class="pick-sel">${bySeg()}</div>`;
      const n = teamSport(sp) ? (TEAMS_BY[sp] || []).length : (PLAYERS_BY[sp] || []).length;
      return `<input class="search" data-in="tsearch" type="search" placeholder="Search ${n || ''} ${teamSport(sp) ? 'teams' : esc(SPORTS[sp].what)}" value="${esc(teamQ)}" autocomplete="off" enterkeyhint="search" />${teamSport(sp) ? `<div class="pick-sel">${confSelect()}${bySeg()}</div>` : ''}`; }
    case 'grid': {
      const sp = pSport(); const q = teamQ.trim().toLowerCase();
      if (allMode()) return allGrid(f, q);
      if (newsSport(sp)) return `<div class="empty">${esc(SPORTS[sp].name)} is headlines-only, so there’s nobody to follow here. Its news uses every outlet you have on — mute names or keywords in Mute.</div>`;
      if (teamSport(sp) && pickMode === 'players') {
        const tname = (id) => (teamById(id) || {}).short || '';
        if (q.length >= 2) {
          const r = searchAthletes(sp, teamQ.trim());
          if (r === 'loading') return '<div class="empty">Searching ESPN…</div>';
          return r.map((p) => playerRow(p, esc([p.pos, p.team || tname(p.teamId)].filter(Boolean).join(' · ')))).join('') || '<div class="empty">No players match. Try a last name.</div>';
        }
        if (browseTeam) {
          const r = ROSTER.get(browseTeam); if (!r) { loadRoster(browseTeam); return '<div class="empty">Loading roster…</div>'; }
          if (r === 'loading') return '<div class="empty">Loading roster…</div>';
          return r.map((p) => playerRow({ ...p, teamId: p.team }, esc([p.jersey ? `#${p.jersey}` : '', p.pos, tname(p.team)].filter(Boolean).join(' · ')))).join('') || '<div class="empty">No roster in ESPN’s feed.</div>';
        }
        const mine = followsIn(sp).filter(isAthleteId).map(playerEnt).filter(Boolean);
        return `<div class="empty small">Search by name, or pick a ${sp === 'cfb' ? 'conference' : 'division'} and team to browse its roster. Followed players are pinned in scores, highlighted in Gamecast and boost the news.</div>${mine.map((p) => playerRow({ id: p.id, name: p.name, headshot: p.logo, teamId: p.team, pos: p.pos }, esc([p.pos, tname(p.team)].filter(Boolean).join(' · ')))).join('')}`;
      }
      if (eventSport(sp)) {
        if (!PLAYERS_BY[sp]) { loadPlayers(sp, pickRoot()); return '<div class="empty">Loading…</div>'; }
        const list = PLAYERS_BY[sp].filter((p) => !q || `${p.name} ${p.country || ''} ${p.team || ''}`.toLowerCase().includes(q));
        let extra = '';
        if (q.length >= 3) { const r = searchAthletes(sp, teamQ.trim()); if (Array.isArray(r)) { const have = new Set(list.map((p) => p.id)); extra = r.filter((p) => !have.has(p.id)).map((p) => playerRow(p, 'ESPN search')).join(''); } else extra = '<div class="empty small">Searching ESPN…</div>'; }
        const show = list.slice(0, q ? 120 : 60);
        return (show.map((p) => playerRow(p, esc([p.country, p.team].filter(Boolean).join(' · ') || 'On a current card'))).join('') + extra) || `<div class="empty">${q ? 'No match.' : `No ${esc(SPORTS[sp].what)} on current cards — search by name.`}</div>`;
      }
      if (!teamSport(sp)) {
        if (!PLAYERS_BY[sp]) { loadPlayers(sp, document.querySelector('#onb') || view); return '<div class="empty">Loading players…</div>'; }
        const list = PLAYERS_BY[sp].filter((p) => !q || `${p.name} ${p.country}`.toLowerCase().includes(q));
        const show = q ? list.slice(0, 120) : list.slice(0, 60);
        return show.map((p) => `<button class="pick-row ${f(p.id) ? 'on' : ''}" data-tfollow="${p.id}" data-pname="${esc(p.name)}" data-pflag="${esc(p.flag || '')}" aria-pressed="${f(p.id)}"><img src="${esc(p.flag || '')}" alt="" class="flag" loading="lazy" /><span class="nm"><b>${esc(p.name)}</b><small>${esc(p.tour || '')}${p.rank ? ` · No. ${p.rank}` : ''}${p.country ? ` · ${esc(p.country)}` : ''}</small></span>${CHECK}</button>`).join('')
          + (list.length > show.length ? `<div class="empty small">Showing ${show.length} of ${list.length} — search to find more.</div>` : '') || '<div class="empty">No players match.</div>';
      }
      const TL = TEAMS_BY[sp]; if (!TL) return '<div class="empty">Loading teams…</div>';
      const list = leagueTeams(TL, { q: teamQ, conf: teamConf });
      return teamRows(list, f) || '<div class="empty">No teams match.</div>';
    }
    case 'confs': return CONFS.map((c) => {
      const n = TEAMS.filter((t) => t.conferenceId === c.id).length; const on = S.conferences.includes(c.id);
      return `<button class="tile ${on ? 'on' : ''}" data-conf="${c.id}" aria-pressed="${on}"><span><b>${esc(c.short)}</b><small>${n} teams</small></span>${CHECK}</button>`;
    }).join('');
    case 'munsel': {
      const n = SPORT_IDS.filter((k) => !S.sports.includes(k)).length; const can = S.sportsChosen; const inOnb = !!document.querySelector('#onb');
      const sub = can ? 'Hides every sport you didn’t pick, even ones added later. Untick to bring them back.' : 'Pick favorite sports first';
      const note = !can ? `<div class="row"><span class="rt"><small class="faint">You’re showing every sport right now, so there is nothing to mute. ${inOnb ? 'Pick sports in the earlier step.' : '<a href="#/settings/sports">Pick your sports</a>'}, then come back.</small></span></div>`
        : S.muteUnselected ? `<div class="row"><span class="rt"><small class="faint" data-munsel-note>Muting ${n} sport${n === 1 ? '' : 's'}: news and games outside ${S.sports.map((k) => esc(SPORTS[k].short)).join(', ')} are hidden.</small></span></div>` : '';
      return `<label class="row munsel-row ${can ? '' : 'disabled'}"><span class="rt"><b>Mute every sport I haven’t selected</b><small>${sub}</small></span><span class="switch"><input type="checkbox" data-flag="muteUnselected" data-munsel ${can && S.muteUnselected ? 'checked' : ''} ${can ? '' : 'disabled'} /></span></label>${note}`;
    }
    case 'leagues': return Object.entries(LEAGUE_MUTES).map(([k, v]) => { const on = S.muteLeagues.includes(k); return `<button class="chip lg mute ${on ? 'on' : ''}" data-league="${k}" aria-pressed="${on}" title="Hides: ${esc(v.words.join(', '))}">${on ? '🔇 ' : ''}${esc(v.label)}</button>`; }).join('');
    case 'kws': return [...S.muteKeywords.map((k) => `<button class="chip lg mute on" data-unkw="${esc(k)}">${esc(k)} <span class="x">✕</span></button>`),
      ...KW_SUGGEST.filter((k) => !S.muteKeywords.some((x) => x.toLowerCase() === k.toLowerCase())).map((k) => `<button class="chip lg ghost" data-addkw="${esc(k)}">+ ${esc(k)}</button>`)].join('');
    case 'mteams': { const l = S.muteTeams.map(teamById).filter(Boolean); return l.map((t) => `<button class="chip lg mute on" data-unmute="${t.id}"><img src="${esc(logo(t))}" alt="" class="${t.player ? 'flag' : ''}" />${esc(t.short)}<small>${esc((SPORTS[t.sport || 'cfb'] || {}).short || '')}</small> <span class="x">✕</span></button>`).join('') || '<span class="faint small">No teams or players muted.</span>'; }
    case 'mresults': {
      const q = muteQ.trim().toLowerCase(); if (q.length < 2) return '';
      S.sports.filter((k) => !teamSport(k) && !newsSport(k)).forEach((k) => loadPlayers(k, document.querySelector('#onb') || view));
      const pool = [...TEAMS.filter((t) => S.sports.includes(t.sport)), ...S.sports.filter((k) => !teamSport(k) && !newsSport(k)).flatMap((k) => (PLAYERS_BY[k] || []).map((p) => ({ ...p, short: p.name, logo: p.flag, logoDark: p.flag, player: true })))];
      return pool.filter((t) => t.name.toLowerCase().includes(q) && !S.muteTeams.includes(t.id)).slice(0, 10).map((t) => `<button class="chip lg" data-mute="${t.id}" ${t.player ? `data-pname="${esc(t.name)}" data-pflag="${esc(t.flag || '')}"` : ''}><img src="${esc(logo(t))}" alt="" class="${t.player ? 'flag' : ''}" />Mute ${esc(t.player ? t.short : fullName(t))}<small>${esc((SPORTS[t.sport] || {}).short || '')}</small></button>`).join('') || '<span class="faint small">No match.</span>';
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
        <div class="row"><span class="rt"><b>How you watch</b><small>${esc(myProviders().map((id) => (PROVIDERS.find((p) => p.id === id) || {}).name).filter(Boolean).join(', ') || 'Not set')}</small></span></div>
        <div class="row"><span class="rt"><b>Straight news only</b><small>${S.straightOnly ? 'On — opinion, picks & betting hidden' : 'Off'}</small></span></div></div>`;
    }
    case 'providers': {
      const mine = myProviders();
      const grp = (g, lbl) => `<div class="group-lbl tiles-lbl">${lbl}</div><div class="prov-grid">${PROVIDERS.filter((p) => p.group === g).map((p) => { const on = mine.includes(p.id); return `<button class="prov-tile ${on ? 'on' : ''}" data-prov="${p.id}" aria-pressed="${on}"><b>${esc(p.name)}</b>${p.sub ? `<small>${esc(p.sub)}</small>` : ''}</button>`; }).join('')}</div>`;
      return grp('live', 'Live TV') + grp('stream', 'Streaming services') + grp('other', 'Other');
    }
    case 'provsummary': { const ps = myProviders().map((id) => (PROVIDERS.find((p) => p.id === id) || {}).name).filter(Boolean); return ps.length ? `Watch buttons for ${esc(ps.join(', '))} show first inside an open game.` : 'Nothing picked — an open game still shows each network’s own watch link.'; }
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
  const b = e.target.closest('[data-prov],[data-tfollow],[data-sport],[data-allsports],[data-psport],[data-lghead],[data-pby],[data-pmode],[data-conf],[data-league],[data-unkw],[data-addkw],[data-unmute],[data-mute],[data-block],[data-unblock],[data-theme]');
  if (!b || !root.contains(b)) return false;
  e.preventDefault(); tick();
  const d = b.dataset; let skip = [];
  if (d.pname && (d.tfollow || d.mute)) rememberPlayer(d.tfollow || d.mute, d.pname, d.pflag, { team: d.pteam, pos: d.ppos });
  if (d.prov) {
    const cur = myProviders(); let next;
    if (d.prov === 'none') next = cur.includes('none') ? [] : ['none'];
    else next = cur.includes(d.prov) ? cur.filter((x) => x !== d.prov) : [...cur.filter((x) => x !== 'none'), d.prov];
    S.watch = { ...(S.watch || {}), providers: next };
  } else if (d.sport && !S.sportsChosen) {
    // first explicit pick while showing everything: show just this sport (tap more to add them)
    S.sports = [d.sport]; S.sportsChosen = true; S.sport = d.sport; pickSport = d.sport; teamQ = ''; teamConf = ''; browseTeam = '';
    ensureTeams(d.sport).then(() => refreshParts(root));
    syncSportUI();
  } else if (d.allsports) {
    S.sportsChosen = false; S.sports = SPORT_IDS.slice(); pickSport = null; syncSportUI();
  } else if (d.sport) {
    const on = S.sports.includes(d.sport);
    if (on && S.sports.length === 1) { toast('Keep at least one sport'); return true; }
    S.sports = on ? S.sports.filter((x) => x !== d.sport) : SPORT_IDS.filter((x) => x === d.sport || S.sports.includes(x));
    if (!S.sports.includes(S.sport)) S.sport = S.sports[0];
    pickSport = on ? null : d.sport; teamQ = ''; teamConf = ''; browseTeam = '';
    if (!on) ensureTeams(d.sport).then(() => refreshParts(root));
    syncSportUI();
  } else if (d.psport === 'all') { pickAll = true; pickMode = 'teams'; teamQ = ''; teamConf = ''; browseTeam = ''; Promise.all(teamSportIds().map(ensureTeams)).then(() => refreshParts(root)); }
  else if (d.psport) { pickAll = false; pickSport = d.psport; teamQ = ''; teamConf = ''; browseTeam = ''; ensureTeams(d.psport).then(() => refreshParts(root)); }
  else if (d.lghead) { if (!pickOpen) pickOpen = new Set(); if (teamQ.trim()) { teamQ = ''; const i = $('[data-in="tsearch"]', root); if (i) i.value = ''; pickOpen.add(d.lghead); } else if (pickOpen.has(d.lghead)) pickOpen.delete(d.lghead); else pickOpen.add(d.lghead); }
  else if (d.pby) { pickBy = d.pby; }
  else if (d.pmode) { pickMode = d.pmode; teamQ = ''; browseTeam = ''; }
  else if (d.tfollow) {
    S.follow = toggle(S.follow, d.tfollow); S.muteTeams = S.muteTeams.filter((x) => !S.follow.includes(x));
    const on = S.follow.includes(d.tfollow);
    root.querySelectorAll(`.pick-row[data-tfollow="${d.tfollow}"]`).forEach((el) => { el.classList.toggle('on', on); el.setAttribute('aria-pressed', on); });
    syncGroupCounts(root); skip = ['grid'];
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
  if (el.dataset.in === 'tconf') { teamConf = el.value; browseTeam = ''; if (pickMode === 'players' && teamSport(pSport())) { const t = $('[data-part="tsearch"]', root); if (t) t.innerHTML = partHTML('tsearch'); } const g = $('[data-part="grid"]', root); if (g) g.innerHTML = partHTML('grid'); }
  else if (el.dataset.in === 'bteam') { browseTeam = el.value; teamQ = ''; const i = $('[data-in="tsearch"]', root); if (i) i.value = ''; const g = $('[data-part="grid"]', root); if (g) g.innerHTML = partHTML('grid'); }
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
  // Braces matter: an `onclick` property handler that RETURNS false cancels the click, which silently stopped every switch/checkbox in Settings from toggling.
  root.onclick = (e) => { prefClick(e, root); }; root.oninput = (e) => { prefInput(e, root); };
  root.onchange = (e) => { prefChange(e, root); }; root.onsubmit = (e) => { prefSubmit(e, root); };
}
const bySeg = () => `<div class="seg by-seg" role="group" aria-label="Sort teams"><button data-pby="az" class="${pickBy === 'az' ? 'on' : ''}" aria-pressed="${pickBy === 'az'}">A–Z</button><button data-pby="conf" class="${pickBy === 'conf' ? 'on' : ''}" aria-pressed="${pickBy === 'conf'}">By conference</button></div>`;
const confSelect = () => `<select class="btn" data-in="tconf" aria-label="${pSport() === 'cfb' ? 'Conference' : 'Division'}"><option value="">All ${pSport() === 'cfb' ? 'conferences' : 'divisions'}</option>${(DIVS_BY[pSport()] || []).map((c) => `<option value="${c.id}" ${teamConf === c.id ? 'selected' : ''}>${esc(c.short)}</option>`).join('')}</select>`;
const flagSwitch = (flag, title, sub) => `<label class="row"><span class="rt"><b>${title}</b><small>${sub}</small></span><span class="switch"><input type="checkbox" data-flag="${flag}" ${S[flag] ? 'checked' : ''} /></span></label>`;
const P = {
  teams: () => `<div data-part="sportseg"></div><div data-part="pmode"></div><div class="lbl" data-part="quicklbl"></div><div class="chips" data-part="quick"></div>
    <div class="lbl">Following <span data-part="followcount"></span></div><div class="chips" data-part="followed"></div>
    <div class="search-wrap" data-part="tsearch"></div>
    <div class="pick-list card" data-part="grid"></div>`,
  confs: () => '<div class="tiles" data-part="confs"></div>',
  sports: () => '<div class="tiles sports" data-part="sports"></div>',
  mute: (full) => `<div class="list card" data-part="munsel"></div>
    <div class="lbl">Leagues & topics</div><div class="chips" data-part="leagues"></div>
    <div class="lbl">Keywords <span class="faint">· whole word, any case</span></div><div class="chips" data-part="kws"></div>
    <form class="kw-form" data-form="kw"><input placeholder="Add a keyword, e.g. Deion" autocomplete="off" enterkeyhint="done" /><button class="btn">Mute</button></form>
    ${full ? `<div class="lbl">Teams & players</div><div class="chips" data-part="mteams"></div><div class="kw-form"><input data-in="mutesearch" placeholder="Type a team or player to mute…" autocomplete="off" /></div><div class="chips" data-part="mresults" style="margin-top:8px"></div>
    <div class="list card" style="margin-top:18px">${flagSwitch('sportOnly', 'This sport only', 'Hide other sports from school, team & local feeds')}</div>` : ''}`,
  watch: () => '<div data-part="providers"></div><p class="faint small" data-part="provsummary" style="margin-top:12px"></p>',
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
  tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M10.5 9v4.5l3.5-2.25z"/>',
};
const icon = (k, c) => `<span class="ic" style="--c:${c}"><svg viewBox="0 0 24 24">${IC[k]}</svg></span>`;
const linkRow = (href, k, c, title, sub) => `<a class="row" href="${href}">${icon(k, c)}<span class="rt"><b>${title}</b><small>${esc(sub)}</small></span><span class="chev">›</span></a>`;
const iconFlag = (flag, k, c, title, sub) => `<label class="row">${icon(k, c)}<span class="rt"><b>${title}</b><small>${sub}</small></span><span class="switch"><input type="checkbox" data-flag="${flag}" ${S[flag] ? 'checked' : ''} /></span></label>`;

function viewSettings(sub) {
  if (sub) return viewSettingsSub(sub);
  setBar('Settings');
  const teamsTxt = S.follow.map(teamById).filter((t) => t && S.sports.includes(t.sport || 'cfb')).map((t) => t.short).join(', ') || 'Nobody yet — showing everything';
  [...new Set(S.follow.map(sportOfId))].forEach((k) => { if (teamSport(k) && !TEAMS_BY[k]) ensureTeams(k).then(() => { if (location.hash === '#/settings') viewSettings(); }); });
  const confTxt = S.conferences.map((id) => CONFS.find((c) => c.id === id)?.short).filter(Boolean).join(', ') || 'All FBS';
  const mutes = activeMutes(); const mySrc = SOURCES.filter((s) => S.sports.includes(s.sport)); const onCount = mySrc.filter((s) => sourceOn(s.id)).length; const bl = S.blockOutlets || [];
  view.innerHTML = LT('Settings', 'Saved on this device only') + `
    <div class="group-lbl">Your feed</div><div class="list card">
      ${linkRow('#/settings/sports', 'sports', 'var(--usa-red-b)', 'Sports', S.sports.map((k) => SPORTS[k].short).join(', '))}
      ${linkRow('#/settings/teams', 'team', 'var(--usa-blue-m)', 'Teams & players', teamsTxt)}
      ${S.sports.includes('cfb') ? linkRow('#/settings/conferences', 'conf', 'var(--usa-blue-m)', 'CFB conferences', confTxt) : ''}
      ${linkRow('#/settings/watch', 'tv', 'var(--usa-red-b)', 'How you watch', myProviders().map((id) => (PROVIDERS.find((p) => p.id === id) || {}).name).filter(Boolean).join(', ') || 'Pick your TV & streaming services')}</div>
    <div class="group-lbl">Filters</div><div class="list card">
      ${linkRow('#/settings/mute', 'mute', 'var(--usa-red)', 'Mute', mutes.length ? mutes.join(', ') : 'Nothing muted')}
      ${linkRow('#/settings/sources', 'src', 'var(--usa-blue-m)', 'News sources', `${onCount} of ${mySrc.length} on${bl.length ? ` · ${bl.length} blocked` : ''}`)}
      ${iconFlag('straightOnly', 'straight', 'var(--usa-blue-m)', 'Straight news only', 'Hide opinion, picks, betting & podcasts')}
      ${iconFlag('sportOnly', 'ball', 'var(--usa-blue-m)', 'This sport only', 'Hide other sports from school, team & local feeds')}</div>
    <div class="group-lbl">App</div><div class="list card">
      ${linkRow('#/settings/appearance', 'moon', '#3a3a38', 'Appearance', cap(S.theme))}
      <button class="row" data-act="tour">${icon('spark', 'var(--usa-blue-m)')}<span class="rt"><b>Replay welcome tour</b><small>Step through setup again</small></span><span class="chev">›</span></button>
      ${linkRow('#/settings/about', 'info', 'var(--usa-blue-m)', 'About & install', 'How filtering works · data sources')}</div>
    <div class="list card" style="margin-top:22px"><button class="row danger" data-act="reset"><span class="rt"><b>Reset all settings</b></span></button></div>
    <p class="faint small center">Old School Sports · no ads, no accounts</p>`;
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
    watch: ['How you watch', 'Pick your live-TV and streaming services. Open any game to see its “Watch on …” buttons — yours come first and highlighted. Saved on this device only.', P.watch()],
    conferences: ['CFB conferences', 'Shown after your teams in Scores and News. Pick none to see all of FBS.', P.confs()],
    mute: ['Mute', 'Muted things are removed everywhere, in every sport: scores, leaderboards, rankings, news and story groups.', P.mute(true)],
    sources: ['News sources', 'Mix wire services, national, local and official team outlets.', `<div class="list card">${flagSwitch('straightOnly', 'Straight news only', 'Hide opinion, picks, betting & podcasts')}</div><div class="group-lbl">Outlets</div><div class="list card" data-part="sources"></div>${P.outlets()}`],
    appearance: ['Appearance', '', '<div class="list card" data-part="theme"></div>'],
    about: ['About & install', '', `<div class="card prose">
      <h3>Install it like an app</h3><p><b>iPhone:</b> Safari → Share → “Add to Home Screen”.<br/><b>Android / Chrome / Edge:</b> menu → “Install app”.</p>
      <h3>How “straight news” works</h3><p>Headlines are labeled automatically with keyword and URL rules (e.g. “column”, “hot take”, “predictions”, “odds”, question headlines). It’s a heuristic, not a bias rating — tap any story to see why it was labeled.</p>
      <h3>Data</h3><p>Scores, schedules, leaderboards, rankings, standings and Gamecast data come from ESPN’s public JSON. Headlines come from RSS feeds (AP, Reuters, CBS, Yahoo, NYT, The Guardian, PGA Tour, LPGA, ATP, WTA, NCAA.com, Deseret News, Salt Lake Tribune, KSL and more) and Google News. Only the sports you pick are shown — NBA, WNBA and the rest of the catalog stay off unless you turn them on. No tracking, no ads; settings stay on this device.</p>
      <h3>Gamecast limits</h3><p>Football: the field is schematic and win probability is ESPN’s model. Baseball: runners and the count are shown only while a game is live. Golf: hole-by-hole scorecards, no shot tracking or world ranking. Tennis: set scores and server only, no point-by-point or match stats. Basketball, hockey and soccer: box scores, lineups and play-by-play from ESPN. UFC: full fight cards with results by round. F1, NASCAR and IndyCar: session results and running order, no telemetry. Boxing: headlines only.</p></div>`],
  };
  const s = screens[sub]; if (!s) { location.hash = '#/settings'; return; }
  setBar(s[0], back);
  view.innerHTML = LT(s[0], s[1]) + `<div class="sub-screen">${s[2]}</div>`;
  refreshParts(view); bindPrefs(view);
}

// ---------------- onboarding (paged, swipeable) ----------------
const STEPS = 7; const CONF_STEP = 3; const WATCH_STEP = 5;
function openOnboarding(start = 0) {
  if ($('#onb')) return;
  teamQ = ''; teamConf = '';
  const el = document.createElement('div'); el.id = 'onb'; el.className = 'onb'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Welcome to Old School Sports');
  el.innerHTML = `<div class="onb-frame">
    <div class="onb-top"><button class="onb-link" data-nav="back"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>Back</button>
      <div class="dots">${rep(STEPS, (i) => `<button class="dot" data-go="${i}" aria-label="Step ${i + 1}"></button>`)}</div>
      <button class="onb-link" data-nav="skip">Skip</button></div>
    <div class="onb-viewport"><div class="onb-track">
      <section class="slide s-welcome"><div class="hero-logo mark"><img src="/icons/mark-192.png?v=25" alt="" /></div>
        <h1>Old School <b>Sports</b></h1><p class="pitch">Scores, Gamecast and headlines from many outlets for just the sports you pick — football, baseball, basketball, hockey, soccer, golf, tennis, MMA and racing — without the hot takes, ads, or leagues you didn’t ask for.</p>
        <ul class="feat"><li><span class="fi">🏈</span><div><b>Your teams and players first</b><small>Games, Gamecast, leaderboards and news for who you pick.</small></div></li>
          <li><span class="fi">📰</span><div><b>Many sources, side by side</b><small>See how different outlets cover the same story.</small></div></li>
          <li><span class="fi">🔇</span><div><b>Mute anything</b><small>Leagues, teams, keywords or whole outlets.</small></div></li></ul>
        <p class="kbd-hint">Tip: use ← → keys to move between steps</p></section>
      <section class="slide"><div class="step-k">Step 1 of 5</div><h2 class="st">Pick your sports</h2><p class="help">Choose one or more. Nothing is on unless you pick it, and you can switch anytime.</p>${P.sports()}</section>
      <section class="slide"><div class="step-k">Step 2 of 5</div><h2 class="st">Pick teams & players</h2><p class="help">Search by name or browse by league, conference or division. Their games and news come first.</p>${P.teams()}</section>
      <section class="slide"><div class="step-k">CFB · optional</div><h2 class="st">Pick conferences</h2><p class="help">Their scores and news show after your teams. Pick none to see all of FBS.</p>${P.confs()}</section>
      <section class="slide"><div class="step-k">Step 3 of 5</div><h2 class="st">Mute what you don’t want</h2><p class="help">Muted things disappear everywhere, in every sport.</p>${P.mute(false)}${P.outlets()}
        <div class="list card" style="margin-top:16px">${flagSwitch('straightOnly', 'Straight news only', 'Hide opinion, hot takes, picks & betting')}</div></section>
      <section class="slide"><div class="step-k">Step 4 of 5</div><h2 class="st">How do you watch?</h2><p class="help">Pick any that you have. Open a game to see “Watch on …” buttons, yours first. Optional — skip it and change it anytime in Settings.</p>${P.watch()}</section>
      <section class="slide s-done"><div class="step-k">Step 5 of 5</div><div class="done-mark"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><h2 class="st">You’re all set</h2><p class="help">Here’s your feed. Change any of it later in Settings.</p><div data-part="summary"></div></section>
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
    next.textContent = i === 0 ? 'Get started' : i === STEPS - 1 ? 'Show my feed' : (i === 2 && !S.follow.length) || (i === CONF_STEP && !S.conferences.length) || (i === WATCH_STEP && !myProviders().length) ? 'Skip this step' : 'Next';
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
    <div class="list card"><button class="row" data-sact="block">${icon('block', 'var(--usa-red-b)')}<span class="rt"><b>Hide everything from ${esc(it.source)}</b><small>You can undo this in Settings → News sources</small></span></button></div>
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
  const de = document.documentElement; // non-core sports get their accent from the catalog
  if (CORE.includes(S.sport)) { delete de.dataset.xa; de.style.removeProperty('--xa'); } else { de.dataset.xa = ''; de.style.setProperty('--xa', SPORTS[S.sport].accent || '#ff7a1a'); }
  if (!['team', 'game', 'schedule', 'player'].includes(name)) BD.setSport(S.sport);
  document.title = `Old School Sports · ${SPORTS[S.sport].short}`;
}
// "Play drive": steps the football play tracker through the drive, one play at a time, animating each; any manual tap stops it.
let autoTimer = null;
function stopAuto() {
  if (autoTimer) clearInterval(autoTimer); autoTimer = null; castState.auto = false;
  document.querySelectorAll('[data-autoplay]').forEach((b) => { b.classList.remove('on'); b.textContent = '▶ Play drive'; b.setAttribute('aria-pressed', 'false'); });
}
function startAuto(card) {
  const ids = ((card && card.dataset.plays) || '').split(',').filter(Boolean); if (ids.length < 2) return;
  let i = ids.indexOf(card.dataset.cur); if (i < 0 || i >= ids.length - 1) i = -1;
  const sp = castState.sport; const id = castState.id;
  castState.auto = true;
  document.querySelectorAll('[data-autoplay]').forEach((b) => { b.classList.add('on'); b.textContent = '❚❚ Pause'; b.setAttribute('aria-pressed', 'true'); });
  const step = () => {
    if (!castState.auto || castState.sport !== sp || castState.id !== id || !(location.hash || '').startsWith('#/game/')) { stopAuto(); return; }
    if (document.hidden) return;
    i += 1; if (i >= ids.length) { stopAuto(); return; }
    castState.fp = ids[i]; castState.mode = 'select';
    viewGame(sp, id, true).then(() => { if (i >= ids.length - 1) setTimeout(() => { if (castState.auto) stopAuto(); }, 1500); });
  };
  step(); autoTimer = setInterval(step, 2600);
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
  const rp = e.target.closest('[data-replay]');
  if (rp && inCast) { tick(); stopAuto(); GA.replay(rp.closest('.gx')); return; }
  const ap = e.target.closest('[data-autoplay]');
  if (ap && inCast) { tick(); if (castState.auto) stopAuto(); else startAuto(ap.closest('.gx')); return; }
  if (tab && inCast) { tick(); stopAuto(); castState.tab = tab.dataset.gctab; castState.mode = 'load'; viewGame(castState.sport, castState.id, true); return; }
  const gs = e.target.closest('[data-gcset]');
  if (gs && inCast) { tick(); const [k, ...v] = gs.dataset.gcset.split('='); if (['fp', 'fd', 'ab', 'sf'].includes(k)) { stopAuto(); castState[k] = v.join('=') || null; if (k === 'fd') castState.fp = null; castState.mode = 'select'; viewGame(castState.sport, castState.id, true); } return; }
  const pf = e.target.closest('[data-pfollow]');
  if (pf) {
    e.preventDefault(); e.stopPropagation(); tick();
    const id = pf.dataset.pfollow; const on = follows(id);
    rememberPlayer(id, pf.dataset.pname, pf.dataset.pflag, { team: pf.dataset.pteam, pos: pf.dataset.ppos });
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
// Live auto-refresh: 15s on lists, 10s in Gamecast; paused while the tab is hidden, caught up when it returns.
let refreshLive = false;
function liveTick() {
  if (document.hidden || $('#sheet') || $('#onb')) return;
  for (const k of mem.keys()) if (k.startsWith('/api/scoreboard') || k.startsWith('/api/game')) mem.delete(k);
  route(true);
}
function scheduleRefresh(live, ms = 15e3) {
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
  if (!['team', 'game', 'schedule', 'player'].includes(name)) lastTab = name;
  if (!['team', 'schedule', 'player'].includes(name)) { clearTeamTheme(); syncThemeColor(); }
  syncSportUI(name);
  if (!silent) { if (HIST[HIST.length - 2] === h) HIST.pop(); else if (HIST[HIST.length - 1] !== h) HIST.push(h); }
  document.querySelectorAll('.nav a[data-tab]').forEach((a) => a.classList.toggle('active', a.dataset.tab === lastTab));
  document.querySelectorAll('.side-teams a').forEach((a) => a.classList.toggle('active', ['team', 'player', 'schedule'].includes(name) && a.dataset.team === decodeURIComponent(arg || '')));
  const depth = ['team', 'game', 'schedule', 'player'].includes(name) || (name === 'settings' && arg) ? 1 : 0;
  if (!silent) {
    const cls = depth > prevDepth ? 'push' : depth < prevDepth ? 'pop' : 'fade';
    view.classList.remove('push', 'pop', 'fade'); void view.offsetWidth; view.classList.add(cls); prevDepth = depth;
    scrollTo(0, 0);
  }
  const y = scrollY; SILENT = !!silent;
  try {
    const mutedSp = ['team', 'schedule', 'player'].includes(name) && arg ? sportOfId(decodeURIComponent(arg)) : name === 'game' && arg ? arg : null;
    if (mutedSp && mutedSports(S).includes(mutedSp)) { setBar(SPORTS[mutedSp].short, { back: '#/home' }); view.innerHTML = `<div class="card panel"><div class="empty">🔇 ${esc(SPORTS[mutedSp].name)} is muted because it isn’t one of your favorite sports.<br/><a class="btn small" href="#/settings/mute">Change in Mute</a></div></div>`; SILENT = false; return; }
    if (name === 'scores') await viewScores();
    else if (name === 'news') await viewNews();
    else if (name === 'rankings') await viewRankings();
    else if (name === 'team' && arg) await viewTeam(decodeURIComponent(arg));
    else if (name === 'schedule' && arg) await viewSchedule(decodeURIComponent(arg));
    else if (name === 'player' && arg) await viewPlayer(decodeURIComponent(arg));
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
    // team lists: enabled team sports + any sport you follow or mute something in (CFB always: rankings/Grok use it)
    const need = [...new Set(['cfb', ...(S.sportsChosen ? S.sports : [S.sport]), ...[...S.follow, ...S.muteTeams].filter((id) => !isAthleteId(id)).map(sportOfId)])].filter(teamSport);
    const [s] = await Promise.all([api('/api/sources', 36e5), ...need.map(ensureTeams)]);
    SOURCES = s;
    if (!TEAMS.length) throw new Error('team lists unavailable');
  } catch (e) { splash.remove(); view.innerHTML = errBox(e); return; }
  // drop ids that no longer exist; keep anything from a list that failed to load, and all remembered players
  const known = (id) => (isAthleteId(id) ? !!S.players[id] : !(TEAMS_BY[sportOfId(id)] || []).length || TEAMS.some((t) => t.id === id));
  S.follow = S.follow.filter(known); S.muteTeams = S.muteTeams.filter(known);
  renderSideTeams();
  window.addEventListener('hashchange', () => route());
  route();
  setTimeout(() => { splash.classList.add('hide'); setTimeout(() => splash.remove(), 450); }, Math.max(0, 450 - (performance.now() - t0)));
}
boot();
// Service worker: check for a new version on every open / return to the app, and reload once when a newer one takes over,
// so an installed PWA that stayed open in the background doesn't keep running old JS against a newer server.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller; let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloading) { reloading = true; location.reload(); } });
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((reg) => {
    reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {}));
}
