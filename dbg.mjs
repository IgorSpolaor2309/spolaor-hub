import pg from "pg";
const c = new pg.Client({connectionString: process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false}});
await c.connect();
console.log((await c.query(`select pg_get_functiondef(oid) d from pg_proc where proname='staff_create_document_request'`)).rows.map(r=>r.d).join("\n"));
await c.end();
