// SeatGeek ticket prices for upcoming games on the schedule pages.
// Sanctioned source only: the SeatGeek Platform API (api.seatgeek.com/2/events), which needs a free client_id.
// Set SEATGEEK_CLIENT_ID in the environment to turn prices on. Without it we never guess a price: each game just gets
// a "Tickets on SeatGeek" link to SeatGeek's own search for that matchup.
const API = 'https://api.seatgeek.com/2/events';
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

module.exports = function makeTickets({ cached, fetchJSON }) {
  const key = () => (process.env.SEATGEEK_CLIENT_ID || '').trim();
  const searchUrl = (q) => `https://seatgeek.com/search?search=${encodeURIComponent(q)}`;
  // what a SeatGeek event must mention to count as this game (both teams, or the tournament name)
  const TAX = { football: 'football', baseball: 'baseball', basketball: 'basketball', hockey: 'hockey', soccer: 'soccer', golf: 'golf', tennis: 'tennis' };
  // a game counts only if it's the right sport, the men's/women's side matches, and BOTH teams are performers
  function matchesGame(e, g) {
    const tax = (e.taxonomies || []).map((t) => t.name);
    if (g.family && TAX[g.family] && !tax.some((t) => t.includes(TAX[g.family]))) return false;
    if (/parking|watch party/i.test(e.title || '') || /parking/.test(e.type || '')) return false;
    const perf = (e.performers || []).map((p) => norm(p.name));
    const womens = !!g.womens;
    const has = (t) => t && perf.some((p) => p.includes(norm(t.name)) && /\bwomen/.test(p) === womens);
    return has(g.home) && has(g.away);
  }
  const matchesEvent = (e, g) => norm(e.title).includes(norm(g.name)) || (e.performers || []).some((p) => norm(p.name).includes(norm(g.name)));
  // g = { kind: 'game', home, away, date } | { kind: 'event', name, date, endDate }
  async function lookup(g) {
    const q = g.kind === 'game' ? `${(g.away && g.away.name) || ''} at ${(g.home && g.home.name) || ''}`.trim() : g.name;
    const fallback = { source: 'seatgeek', priced: false, url: searchUrl(q), label: 'Tickets on SeatGeek' };
    const k = key(); if (!k || !g.date) return fallback;
    const d0 = new Date(Date.parse(g.date) - 36 * 3600e3).toISOString().slice(0, 19);
    const d1 = new Date(Date.parse(g.endDate || g.date) + 36 * 3600e3).toISOString().slice(0, 19);
    const term = g.kind === 'game' ? (g.home && g.home.name) : g.name;
    const url = `${API}?client_id=${encodeURIComponent(k)}&q=${encodeURIComponent(term)}&datetime_utc.gte=${d0}&datetime_utc.lte=${d1}&per_page=25`;
    try {
      const r = await cached(`sg:${url}`, 30 * 60e3, () => fetchJSON(url));
      const ok = (r.events || []).filter((x) => (g.kind === 'game' ? matchesGame(x, g) : matchesEvent(x, g)));
      const e = ok.sort((a, b) => Math.abs(Date.parse(`${a.datetime_utc}Z`) - Date.parse(g.date)) - Math.abs(Date.parse(`${b.datetime_utc}Z`) - Date.parse(g.date)))[0];
      if (!e) return { ...fallback, matched: false };
      // SeatGeek only includes price stats for some client IDs; when it sends none we link the event page with no price
      const st = e.stats || {}; const low = st.lowest_price ?? st.lowest_sg_base_price ?? null;
      return { source: 'seatgeek', priced: low != null, lowest: low != null ? Math.round(low) : null, url: e.url, eventId: e.id,
        label: low != null ? `Tickets from $${Math.round(low)} on SeatGeek` : 'Tickets on SeatGeek', matched: true };
    } catch { return fallback; }
  }
  // Attach `tickets` to upcoming events (max 25 per page, 4 at a time).
  async function attach(events, toQuery) {
    const up = events.filter((e) => e.state === 'pre' && Date.parse(e.date) > Date.now() - 6 * 3600e3).slice(0, 25);
    for (let i = 0; i < up.length; i += 4) await Promise.all(up.slice(i, i + 4).map(async (e) => { e.tickets = await lookup(toQuery(e)); }));
    return events;
  }
  return { lookup, attach, enabled: () => !!key() };
};
