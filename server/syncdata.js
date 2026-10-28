// Recovery-code sync: pure helpers (code format, hashing, payload validation, summary). No I/O here.
const crypto = require('crypto');

// Crockford Base32: no I, L, O, U. 12 characters = 60 bits.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LEN = 12;
const MAX_BYTES = 32 * 1024;

function newCode(randomBytes = crypto.randomBytes) {
  const b = randomBytes(CODE_LEN);
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += ALPHABET[b[i] & 31]; // 256 % 32 === 0, so no modulo bias
  return s;
}
const formatCode = (c) => `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
// Accepts any case, dashes, spaces; folds the look-alikes the way Crockford says (O→0, I/L→1). Returns null when it can't be a code.
function normalizeCode(input) {
  if (typeof input !== 'string' || input.length > 64) return null;
  const s = input.toUpperCase().replace(/[\s\-_.]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return new RegExp(`^[${ALPHABET}]{${CODE_LEN}}$`).test(s) ? s : null;
}
// The database only ever holds this. Without the server pepper a leaked table cannot be turned back into codes.
const hashCode = (pepper, norm) => crypto.createHmac('sha256', pepper).update(norm).digest('hex');

// ---- payload validation: allow-list of keys, types and caps; unknown keys are dropped ----
const str = (max) => (v) => typeof v === 'string' && v.length <= max;
const bool = (v) => typeof v === 'boolean';
const strList = (maxItems, maxLen) => (v) => Array.isArray(v) && v.length <= maxItems && v.every((x) => typeof x === 'string' && x.length > 0 && x.length <= maxLen);
const prim = (v) => ['string', 'number', 'boolean'].includes(typeof v) && (typeof v !== 'string' || v.length <= 300);
const KEYS = {
  v: (v) => Number.isInteger(v) && v >= 1 && v <= 99,
  sports: strList(80, 24), sportsChosen: bool, sport: str(24),
  players: (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 500 && Object.entries(v).every(([k, p]) => /^[A-Za-z0-9:_-]{1,40}$/.test(k) && p && typeof p === 'object' && !Array.isArray(p) && Object.keys(p).length <= 12 && Object.entries(p).every(([pk, pv]) => /^[A-Za-z0-9_]{1,24}$/.test(pk) && prim(pv))),
  muteUnselected: bool,
  conferences: strList(60, 40), follow: strList(500, 40),
  muteTeams: strList(500, 120), muteLeagues: strList(40, 40), muteKeywords: strList(500, 120), blockOutlets: strList(300, 120),
  sources: (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 300 && Object.entries(v).every(([k, x]) => /^[A-Za-z0-9:_.-]{1,60}$/.test(k) && typeof x === 'boolean'),
  straightOnly: bool, sportOnly: bool, theme: (v) => ['system', 'light', 'dark'].includes(v),
  watch: (v) => v && typeof v === 'object' && !Array.isArray(v) && strList(60, 40)(v.providers),
};
const SYNCED_KEYS = Object.keys(KEYS);

// -> { ok:true, data } | { ok:false, status, error }. Never throws.
function sanitize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, status: 400, error: 'data must be an object' };
  const out = {};
  for (const k of SYNCED_KEYS) {
    if (!(k in input)) continue;
    if (!KEYS[k](input[k])) return { ok: false, status: 400, error: `invalid field: ${k}` };
    out[k] = k === 'watch' ? { providers: input.watch.providers.slice() } : input[k];
  }
  if (!Object.keys(out).length) return { ok: false, status: 400, error: 'nothing to save' };
  if (Buffer.byteLength(JSON.stringify(out)) > MAX_BYTES) return { ok: false, status: 413, error: 'data too large' };
  return { ok: true, data: out };
}

const isAthlete = (id) => /^[a-z0-9]+:a\d+$/.test(String(id)) || /^(golf|tennis):/.test(String(id));
// What the "found a backup" screen shows before the user confirms. Counts only: no names, nothing else leaves the server.
function summarize(data) {
  const d = data || {};
  const follow = Array.isArray(d.follow) ? d.follow : [];
  const n = (a) => (Array.isArray(a) ? a.length : 0);
  return {
    sports: d.sportsChosen === false ? 'all' : n(d.sports),
    teams: follow.filter((x) => !isAthlete(x)).length,
    players: follow.filter(isAthlete).length,
    mutes: n(d.muteTeams) + n(d.muteLeagues) + n(d.muteKeywords) + n(d.blockOutlets),
  };
}

module.exports = { ALPHABET, CODE_LEN, MAX_BYTES, SYNCED_KEYS, newCode, formatCode, normalizeCode, hashCode, sanitize, summarize };
