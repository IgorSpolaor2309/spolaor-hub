import pg from "pg";
const c = new pg.Client({connectionString: process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false}});
await c.connect();
const def = (await c.query(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='list_document_workspace_paginated'`)).rows[0].d;
console.log(def.slice(0, 5000));
await c.end();
