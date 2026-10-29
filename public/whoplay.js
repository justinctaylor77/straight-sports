// "What happened and who was involved" — shared renderers for every Gamecast.
// The server (server/playwho.js) attaches to each play: what (short label), desc (one plain sentence) and who[]
// ({role, name, id, team, jersey, pos}); headshots come once per game in d.heads (id → url). Nothing here invents a name:
// if a play has no `who` the chips are simply omitted and the raw ESPN text is shown, never a blank.
import { bpBadge } from './bigplay.js?v=28';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (n) => String(n || '').split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase();

/** The one sentence to show for a play: server description, else the raw ESPN text. Never empty if either exists. */
export function playText(p) { return String((p && (p.desc || p.text || p.what)) || '').trim(); }

/** Who chips: avatar (headshot → jersey number → initials), role, name, team. */
export function whoChips(who, heads, { max = 5, link = true } = {}) {
  const list = (who || []).filter((w) => w && w.name).slice(0, max);
  if (!list.length) return '';
  return `<div class="who" role="list" aria-label="Players involved">${list.map((w) => {
    const hs0 = w.headshot || (heads && w.id && heads[w.id]); const hs = /^https:\/\//.test(hs0 || '') ? hs0 : null;
    const av = hs ? `<img src="${esc(hs)}" alt="" width="26" height="26" loading="lazy" />` : `<span class="wi">${esc(w.jersey ? `#${w.jersey}` : initials(w.name))}</span>`;
    const nm = link && w.id && /^[a-z0-9]+:/i.test(w.id) ? `<a href="#/player/${esc(w.id)}">${esc(w.name)}</a>` : esc(w.name);
    const sub = [w.team && !/^https?:/.test(w.team) ? w.team : null, w.jersey && hs ? `#${w.jersey}` : null, w.pos].filter(Boolean).join(' · ');
    return `<span class="wc" role="listitem">${av}<span class="wt"><small class="wr">${esc(w.role || 'Involved')}</small><b>${nm}</b>${sub ? `<small class="ws">${esc(sub)}</small>` : ''}</span></span>`;
  }).join('')}</div>`;
}

/** A play as: label, plain sentence, who chips. `ctx` = {heads}. */
export function playBlock(p, heads, { chips = true, label = true, max = 5 } = {}) {
  if (!p) return '';
  const txt = playText(p);
  if (!txt) return '';
  const what = label && p.what && p.what !== txt ? `<b class="pw">${esc(p.what)}</b> ` : '';
  return `<div class="pb2">${bpBadge(p)}${what}<span class="pd">${esc(txt)}</span>${chips ? whoChips(p.who, heads, { max }) : ''}</div>`;
}

/** Banner for "the play that just happened": used in the field card, diamond card and generic Latest play. */
export function latestBanner(title, p, heads, fallbackText) {
  const src = p && playText(p) ? p : fallbackText ? { desc: fallbackText } : null;
  if (!src) return '';
  return `<div class="last lp" aria-live="polite"><span class="faint small lp-t">${esc(title)}${p && p.clock ? ` · ${esc(p.clock)}` : ''}</span>${playBlock(src, heads)}</div>`;
}
