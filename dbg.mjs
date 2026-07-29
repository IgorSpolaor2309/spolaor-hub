import pg from "pg";
const c = new pg.Client({connectionString: process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false}});
await c.connect();
const def = (await c.query(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='list_document_workspace_paginated'`)).rows[0].d;
const i = def.toLowerCase().indexOf("aguardando_cliente");
console.log(def.slice(Math.max(0,i-1500), i+1500));
await c.end();
