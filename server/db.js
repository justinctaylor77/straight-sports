// Thin Postgres adapter over Neon's HTTPS query function (@neondatabase/serverless `neon(url)`).
// HTTPS only: it works on hosts that block raw Postgres TCP (port 5432) and on Render. The connection string comes from the
// environment and is never logged; error messages are scrubbed of anything that looks like a connection URL before they leave here.
const scrub = (m) => String(m || '').replace(/postgres(ql)?:\/\/\S+/gi, '<db-url>');

// Returns async (text, params) => rows, or null when there is no usable URL. Each call times out after `timeoutMs` (Neon wakes from scale-to-zero in a few seconds).
function neonQuery(url, { timeoutMs = 12000 } = {}) {
  if (!url || !/^postgres(ql)?:\/\//i.test(url)) return null;
  let sql;
  try { sql = require('@neondatabase/serverless').neon(url); } catch (e) { throw new Error(scrub(e.message)); }
  return async (text, params = []) => {
    let timer;
    try {
      return await Promise.race([
        sql.query(text, params),
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('database timeout')), timeoutMs); }),
      ]);
    } catch (e) { throw Object.assign(new Error(scrub(e.message)), { code: e.code }); }
    finally { clearTimeout(timer); }
  };
}

module.exports = { neonQuery, scrub };
