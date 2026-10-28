// Cleans up the throwaway schema created by the QA run (SYNC_TEST_SCHEMA) via the app's own store adapter and confirms it is gone.
const { neonQuery } = require('../server/db'); const { pgStore } = require('../server/syncstore'); const s = process.env.SYNC_TEST_SCHEMA || '';
const q = neonQuery(process.env.NEON_DATABASE_URL || '');
if (!q || !/^sync_test_[a-f0-9]+$/.test(s)) { console.log('no test schema to clean up'); process.exit(0); }
const gone = () => q('select count(*)::int as n from information_schema.schemata where schema_name = $1', [s]);
const done = (r) => console.log('test schema ' + s + ' removed; remaining=' + r[0].n);
const bad = (e) => { console.log('schema cleanup failed:', e.message); process.exit(1); };
const st = pgStore(q, { schema: s });
st.dropSchema().then(gone).then(done, bad);
