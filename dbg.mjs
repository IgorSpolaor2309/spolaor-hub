import pg from "pg";
import { randomUUID } from "node:crypto";
const c = new pg.Client({connectionString: process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false}});
await c.connect();
const uid = randomUUID();
await c.query(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,[uid,`dbg-${uid}@t.local`]);
await c.query(`insert into public.profiles(id,full_name,email,status) values ($1,'dbg','x@t.local','active') on conflict (id) do nothing`,[uid]);
await c.query(`insert into public.user_roles(user_id,role) values ($1,'collaborator') on conflict do nothing`,[uid]);
const cb = (await c.query(`insert into public.clients(razao_social,status,origem_cadastro) values ('DBG B','ativo','manual') returning id`)).rows[0].id;
await c.query(`select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, false)`,[uid]);
await c.query(`set local role authenticated`).catch(()=>{});
try {
  const r = await c.query(`select public.staff_create_document_request($1,'dbg cross') as r`,[cb]);
  console.log("CREATED (bug):", JSON.stringify(r.rows[0].r).slice(0,200));
} catch(e){ console.log("BLOCKED:", e.message); }
console.log("uid roles:", (await c.query(`select role from public.user_roles where user_id=$1`,[uid])).rows);
console.log("access:", (await c.query(`select public.user_has_client_access($1,$2) a, public.is_admin($1) adm`,[uid,cb])).rows);
await c.query(`reset role`);
await c.query(`delete from public.document_requests where client_id=$1`,[cb]);
await c.query(`delete from public.clients where id=$1`,[cb]);
await c.query(`delete from public.user_roles where user_id=$1`,[uid]);
await c.query(`delete from public.profiles where id=$1`,[uid]);
await c.query(`delete from auth.users where id=$1`,[uid]);
await c.end();
