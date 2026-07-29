import pg from "pg";
const c = new pg.Client({connectionString: process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false}});
await c.connect();
const q = async (s)=> (await c.query(s)).rows;
console.log("policies:", (await q(`select policyname, cmd, pg_get_expr(qual,polrelid) from pg_policies p join pg_policy pol on pol.polname=p.policyname join pg_class cl on cl.oid=pol.polrelid where cl.relname='document_requests' and p.tablename='document_requests'`)).map(r=>[r.policyname,r.cmd,String(r.pg_get_expr).slice(0,300)]));
await c.end();
