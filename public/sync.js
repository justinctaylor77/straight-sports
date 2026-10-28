// Recovery-code sync, client side (v1.4.0). Local storage stays the working copy; the server copy is a best-effort backup.
// Pure helpers (pick / merge / format) plus a small client that takes its dependencies by injection so it can be tested without a browser.

export const SYNCED = ['v', 'sports', 'sportsChosen', 'sport', 'players', 'muteUnselected', 'conferences', 'follow', 'muteTeams', 'muteLeagues', 'muteKeywords', 'blockOutlets', 'sources', 'straightOnly', 'sportOnly', 'theme', 'watch'];
const LISTS = ['conferences', 'follow', 'muteTeams', 'muteLeagues', 'muteKeywords', 'blockOutlets'];
const SCALARS = ['sport', 'muteUnselected', 'straightOnly', 'sportOnly', 'theme'];
export const DEBOUNCE_MS = 3000;
const STATE_KEY = 'ss.sync.v1'; // {code, rev, syncedAt, dirty, modifiedAt}; not part of the synced settings
export const LS_KEY = STATE_KEY;

// The slice of the settings that is backed up. Never includes onboarded, caches or anything device-specific.
export function pick(settings) {
  const out = {};
  for (const k of SYNCED) if (settings && settings[k] !== undefined) out[k] = structuredClone(settings[k]);
  return out;
}
const union = (a = [], b = []) => [...new Set([...(a || []), ...(b || [])])];
// Merge for "Merge with what's on this device" and for 409 conflicts: union of teams, players, mutes, keywords;
// single-value settings come from `newer` ('local' | 'remote').
export function merge(local, remote, newer = 'local') {
  const L = pick(local); const R = pick(remote); const win = newer === 'remote' ? R : L; const lose = newer === 'remote' ? L : R;
  const out = { ...lose, ...win };
  for (const k of LISTS) out[k] = union(L[k], R[k]);
  if (L.sportsChosen && R.sportsChosen) { out.sports = union(L.sports, R.sports); out.sportsChosen = true; }
  else if (L.sportsChosen || R.sportsChosen) { const c = L.sportsChosen ? L : R; out.sports = c.sports; out.sportsChosen = true; }
  else { out.sports = win.sports; out.sportsChosen = false; }
  out.players = { ...(lose.players || {}), ...(win.players || {}) };
  out.sources = { ...(lose.sources || {}), ...(win.sources || {}) };
  out.watch = { providers: union(L.watch && L.watch.providers, R.watch && R.watch.providers) };
  for (const k of SCALARS) if (win[k] !== undefined) out[k] = win[k]; else if (lose[k] !== undefined) out[k] = lose[k];
  out.v = Math.max(L.v || 0, R.v || 0) || undefined;
  if (out.v === undefined) delete out.v;
  return out;
}
// Settings after a restore: the backup's synced keys laid over this device's other keys. `onboarded` is set so a restored device skips setup.
export const overlay = (settings, data) => ({ ...settings, ...structuredClone(data), onboarded: true });
export const formatCode = (code) => String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/(.{4})(?=.)/g, '$1-');
export const normalizeCode = (s) => { const c = String(s || '').toUpperCase().replace(/[\s\-_.]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1'); return /^[0-9A-HJKMNP-TV-Z]{12}$/.test(c) ? c : null; };

const j = (m, d) => (d === undefined ? { method: m } : { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });

// deps: { fetch, storage (getItem/setItem/removeItem), getSettings(), applySettings(next), now(), setTimer(fn, ms), clearTimer(id), onChange() }
export function createSyncClient(deps) {
  const D = { now: Date.now, setTimer: (f, ms) => setTimeout(f, ms), clearTimer: (t) => clearTimeout(t), onChange() {}, ...deps };
  let timer = null; let flushing = null; let muted = 0; let last = { status: 'idle', error: '' };
  const load = () => { try { return JSON.parse(D.storage.getItem(STATE_KEY) || 'null'); } catch { return null; } };
  const save = (s) => { if (s) D.storage.setItem(STATE_KEY, JSON.stringify(s)); else D.storage.removeItem(STATE_KEY); D.onChange(); };
  const set = (patch) => { const s = load(); if (s) save({ ...s, ...patch }); };
  const call = async (path, init = {}, code) => {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null; const t = ctl ? setTimeout(() => ctl.abort(), 20000) : null;
    try {
      const r = await D.fetch(`/api/sync${path}`, { ...init, headers: { ...(init.headers || {}), ...(code ? { Authorization: `Sync ${code}` } : {}) }, signal: ctl && ctl.signal, cache: 'no-store' });
      let body = null; try { body = await r.json(); } catch {}
      return { status: r.status, body, retryAfter: Number(r.headers && r.headers.get && r.headers.get('retry-after')) || 0 };
    } catch { return { status: 0, body: null }; } finally { if (t) clearTimeout(t); }
  };
  const fail = (r) => ({ ok: false, status: r.status, error: r.status === 0 ? 'offline' : r.status === 429 ? 'busy' : r.status === 503 ? 'unavailable' : r.status === 404 ? 'not-found' : 'error' });

  const api = {
    state: load, get last() { return last; },
    linked: () => !!(load() && load().code),
    async serverStatus() { const r = await call('/status'); return r.status === 200 && r.body ? r.body : { enabled: false, ready: false, offline: r.status === 0 }; },
    // Create a new backup from this device's settings. Returns { ok, code } (code shown once to the user, kept here so "Show my code" works).
    async create() {
      const r = await call('', j('POST', { data: pick(D.getSettings()) })); if (r.status !== 201) return fail(r);
      save({ code: r.body.code, rev: r.body.rev, syncedAt: D.now(), dirty: false, modifiedAt: D.now() }); last = { status: 'ok', error: '' };
      return { ok: true, code: r.body.code };
    },
    // What is stored under a code: counts and date only.
    async lookup(code) { const r = await call('/lookup', j('POST', { code })); return r.status === 200 ? { ok: true, ...r.body } : fail(r); },
    // mode 'replace' = use the backup; 'merge' = union with this device. Links this device to the code afterwards.
    async restore(code, mode = 'replace') {
      const c = normalizeCode(code); if (!c) return { ok: false, error: 'not-found', status: 404 };
      const r = await call('/profile', { method: 'GET' }, c); if (r.status !== 200) return fail(r);
      const next = mode === 'merge' ? overlay(D.getSettings(), merge(D.getSettings(), r.body.data, 'local')) : overlay(D.getSettings(), r.body.data);
      muted++; try { D.applySettings(next); } finally { muted--; }
      save({ code: formatCode(c), rev: r.body.rev, syncedAt: D.now(), dirty: mode === 'merge', modifiedAt: D.now() });
      if (mode === 'merge') api.markDirty(true);
      last = { status: 'ok', error: '' }; return { ok: true, rev: r.body.rev };
    },
    // Called after every local settings save. Debounced; best effort.
    markDirty(now = false) {
      if (muted || !load() || !load().code) return;
      set({ dirty: true, modifiedAt: D.now() });
      if (timer) D.clearTimer(timer); timer = D.setTimer(() => { timer = null; return api.flush(); }, now ? 0 : DEBOUNCE_MS);
    },
    // Push local changes. One retry after merging if another device wrote first.
    flush() {
      if (flushing) return flushing;
      flushing = (async () => {
        try {
          for (let attempt = 0; attempt < 2; attempt++) {
            const s = load(); if (!s || !s.code) return { ok: false, error: 'not-linked' };
            const r = await call('/profile', { ...j('PUT', { data: pick(D.getSettings()) }), headers: { 'Content-Type': 'application/json', 'If-Match': String(s.rev) } }, s.code);
            if (r.status === 200) { set({ rev: r.body.rev, syncedAt: D.now(), dirty: false }); last = { status: 'ok', error: '' }; return { ok: true, rev: r.body.rev }; }
            if (r.status === 409 && r.body && r.body.data) { // another device saved first: union, keep this device's single values, try once more
              const merged = overlay(D.getSettings(), merge(D.getSettings(), r.body.data, 'local')); muted++; try { D.applySettings(merged); } finally { muted--; }
              set({ rev: r.body.rev }); continue;
            }
            if (r.status === 404) { save(null); last = { status: 'gone', error: '' }; return { ok: false, error: 'backup-missing' }; } // deleted elsewhere: unlink, keep local settings
            last = { status: r.status === 0 ? 'offline' : 'error', error: fail(r).error };
            if (r.status === 429 && r.retryAfter) { if (timer) D.clearTimer(timer); timer = D.setTimer(() => { timer = null; return api.flush(); }, r.retryAfter * 1000); }
            D.onChange(); return fail(r); // dirty stays true: retried on the next change, on `online`, and on app start
          }
          last = { status: 'conflict', error: 'conflict' }; D.onChange(); return { ok: false, error: 'conflict' };
        } finally { flushing = null; }
      })();
      return flushing;
    },
    // On app start / "Sync now": push if there are unsaved changes, otherwise fetch what other devices saved.
    async sync() {
      const s = load(); if (!s || !s.code) return { ok: false, error: 'not-linked' };
      if (s.dirty) return api.flush();
      const r = await call('/profile', { method: 'GET' }, s.code);
      if (r.status === 404) { save(null); last = { status: 'gone', error: '' }; return { ok: false, error: 'backup-missing' }; }
      if (r.status !== 200) { last = { status: r.status === 0 ? 'offline' : 'error', error: fail(r).error }; D.onChange(); return fail(r); }
      if (r.body.rev > s.rev) { muted++; try { D.applySettings(overlay(D.getSettings(), r.body.data)); } finally { muted--; } set({ rev: r.body.rev, syncedAt: D.now(), dirty: false }); last = { status: 'ok', error: '' }; return { ok: true, pulled: true, rev: r.body.rev }; }
      set({ syncedAt: D.now() }); last = { status: 'ok', error: '' }; return { ok: true, pulled: false, rev: s.rev };
    },
    // Delete the server copy and forget the code on this device. This device keeps its settings.
    async turnOff() {
      const s = load(); if (!s || !s.code) return { ok: true };
      const r = await call('/profile', { method: 'DELETE' }, s.code);
      if (r.status === 204 || r.status === 404) { save(null); if (timer) { D.clearTimer(timer); timer = null; } last = { status: 'idle', error: '' }; return { ok: true }; }
      return fail(r);
    },
    forget() { save(null); if (timer) { D.clearTimer(timer); timer = null; } },
  };
  return api;
}
