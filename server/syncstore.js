// Storage adapters for recovery-code sync. Two implementations of one small interface:
//   pgStore(query, { schema })  -> Postgres (Neon over HTTPS) through a `query(text, params) => rows` function
//   memStore({ now })           -> in-memory fake used by unit tests (same semantics, no network)
// Interface (all async):
//   migrate()                         idempotent CREATE ... IF NOT EXISTS
//   create(id, data)                  -> { rev, updatedAt } | null when the id already exists
//   read(id)                          -> { data, rev, updatedAt } | null   (also refreshes last_read_at)
//   write(id, data, ifRev)            -> { status:'ok', rev, updatedAt } | { status:'conflict', data, rev, updatedAt } | { status:'missing' }
//                                        ifRev null/undefined = overwrite whatever is there
//   remove(id)                        -> boolean
//   purge(maxAgeMs)                   -> number of profiles deleted (inactive longer than maxAgeMs)
//   size()                            -> number of profiles (used by tests and diagnostics)

const IDENT = /^[a-z_][a-z0-9_]{0,40}$/;

function pgStore(query, { schema = 'public' } = {}) {
  if (!IDENT.test(schema)) throw new Error('bad schema name');
  const T = `"${schema}".profiles`;
  const ms = (r) => Number(r.ms);
  const stmts = [
    ...(schema === 'public' ? [] : [`create schema if not exists "${schema}"`]),
    `create table if not exists ${T} (
       id text primary key,
       data jsonb not null,
       rev integer not null default 1,
       created_at timestamptz not null default now(),
       updated_at timestamptz not null default now(),
       last_read_at timestamptz not null default now())`,
    `create index if not exists profiles_last_read_idx on ${T} (last_read_at)`,
  ];
  return {
    schema,
    async migrate() {
      for (let attempt = 0; ; attempt++) {
        try { for (const s of stmts) await query(s, []); return; }
        catch (e) { if (attempt >= 1) throw e; } // two instances booting together can race on CREATE; one retry settles it
      }
    },
    async create(id, data) {
      const r = await query(`insert into ${T} (id, data) values ($1, $2::jsonb) on conflict (id) do nothing returning rev, (extract(epoch from updated_at) * 1000)::bigint as ms`, [id, JSON.stringify(data)]);
      return r.length ? { rev: r[0].rev, updatedAt: ms(r[0]) } : null;
    },
    async read(id) {
      const r = await query(`update ${T} set last_read_at = now() where id = $1 returning data, rev, (extract(epoch from updated_at) * 1000)::bigint as ms`, [id]);
      return r.length ? { data: r[0].data, rev: r[0].rev, updatedAt: ms(r[0]) } : null;
    },
    async write(id, data, ifRev) {
      const r = await query(`update ${T} set data = $2::jsonb, rev = rev + 1, updated_at = now(), last_read_at = now() where id = $1 and ($3::int is null or rev = $3::int) returning rev, (extract(epoch from updated_at) * 1000)::bigint as ms`, [id, JSON.stringify(data), ifRev == null ? null : ifRev]);
      if (r.length) return { status: 'ok', rev: r[0].rev, updatedAt: ms(r[0]) };
      const cur = await query(`select data, rev, (extract(epoch from updated_at) * 1000)::bigint as ms from ${T} where id = $1`, [id]);
      return cur.length ? { status: 'conflict', data: cur[0].data, rev: cur[0].rev, updatedAt: ms(cur[0]) } : { status: 'missing' };
    },
    async remove(id) { return (await query(`delete from ${T} where id = $1 returning 1 as x`, [id])).length > 0; },
    async purge(maxAgeMs) { return (await query(`delete from ${T} where last_read_at < now() - ($1::bigint * interval '1 millisecond') returning 1 as x`, [Math.floor(maxAgeMs)])).length; },
    async size() { return Number((await query(`select count(*) as n from ${T}`, []))[0].n); },
    async dropSchema() { if (schema === 'public') throw new Error('refusing to drop the public schema'); await query(`drop schema if exists "${schema}" cascade`, []); },
  };
}

function memStore({ now = Date.now } = {}) {
  const rows = new Map();
  const clone = (x) => JSON.parse(JSON.stringify(x));
  return {
    schema: 'memory',
    migrated: 0,
    async migrate() { this.migrated++; },
    async create(id, data) { if (rows.has(id)) return null; const t = now(); rows.set(id, { data: clone(data), rev: 1, updatedAt: t, lastRead: t }); return { rev: 1, updatedAt: t }; },
    async read(id) { const r = rows.get(id); if (!r) return null; r.lastRead = now(); return { data: clone(r.data), rev: r.rev, updatedAt: r.updatedAt }; },
    async write(id, data, ifRev) {
      const r = rows.get(id); if (!r) return { status: 'missing' };
      if (ifRev != null && r.rev !== ifRev) return { status: 'conflict', data: clone(r.data), rev: r.rev, updatedAt: r.updatedAt };
      r.data = clone(data); r.rev++; r.updatedAt = r.lastRead = now(); return { status: 'ok', rev: r.rev, updatedAt: r.updatedAt };
    },
    async remove(id) { return rows.delete(id); },
    async purge(maxAgeMs) { let n = 0; for (const [k, r] of rows) if (now() - r.lastRead > maxAgeMs) { rows.delete(k); n++; } return n; },
    async size() { return rows.size; },
    _rows: rows,
  };
}

module.exports = { pgStore, memStore };
