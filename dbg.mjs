import pg from "pg";
const c = new pg.Client({connectionString: process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false}});
await c.connect();
console.log((await c.query(`select pg_get_functiondef(oid) d from pg_proc where proname='user_has_client_access'`)).rows.map(r=>r.d).join("\n"));
console.log((await c.query(`select count(*) from public.clients where razao_social like 'B crq-%'`)).rows);
await c.end();
