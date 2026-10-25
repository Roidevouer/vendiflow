-- Exécution : supabase db reset && psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_isolation.sql
begin;
create function pg_temp.as_user(u uuid, e text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated','email',e)::text, true);
  set local role authenticated;
end $$;

insert into auth.users (id,email) values
 ('00000000-0000-0000-0000-00000000000a','a@a.test'),
 ('00000000-0000-0000-0000-00000000000b','b@b.test'),
 ('00000000-0000-0000-0000-00000000000c','c@c.test');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','a@a.test');
select set_config('t.co_a', public.create_company('Alpha SARL')::text, true);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b','b@b.test');
select set_config('t.co_b', public.create_company('Beta SA')::text, true);

-- 1. Isolation en lecture
do $$ begin
  assert (select count(*) from public.companies) = 1, 'B ne voit que sa société';
  assert (select count(*) from public.companies where id = current_setting('t.co_a')::uuid) = 0, 'B ne voit pas A';
  assert (select count(*) from public.memberships where company_id = current_setting('t.co_a')::uuid) = 0, 'memberships isolées';
  assert (select count(*) from public.audit_logs where company_id = current_setting('t.co_a')::uuid) = 0, 'audit isolé';
end $$;

-- 2. Écriture inter-société refusée
do $$ declare n int; begin
  update public.companies set name = 'Piraté' where id = current_setting('t.co_a')::uuid;
  get diagnostics n = row_count; assert n = 0, 'B ne peut pas modifier A';
end $$;

-- 3. Pas d'écriture directe sur memberships ni audit_logs
do $$ begin
  begin insert into public.memberships (company_id,user_id,role)
    values (current_setting('t.co_a')::uuid,'00000000-0000-0000-0000-00000000000b','owner');
    raise exception 'FAIL: insert memberships autorisé';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin insert into public.audit_logs (action) values ('forgé');
    raise exception 'FAIL: insert audit autorisé';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- 4. Lecture seule ; invitation liée à l'e-mail ; changement de rôle inter-société
reset role;
insert into public.memberships (company_id,user_id,role)
  values (current_setting('t.co_a')::uuid,'00000000-0000-0000-0000-00000000000c','viewer');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c','c@c.test');
do $$ declare n int; begin
  assert (select count(*) from public.companies) = 1, 'viewer voit sa société';
  update public.companies set name = 'X' where id = current_setting('t.co_a')::uuid;
  get diagnostics n = row_count; assert n = 0, 'viewer ne peut pas modifier';
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','a@a.test');
insert into public.invitations (company_id,email,role,token_hash,invited_by)
 values (current_setting('t.co_a')::uuid,'new@a.test','sales',
         encode(extensions.digest('jeton-secret','sha256'),'hex'),'00000000-0000-0000-0000-00000000000a');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b','b@b.test');
do $$ begin
  begin perform public.accept_invitation('jeton-secret');
    raise exception 'FAIL: mauvais e-mail accepté';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.change_member_role(current_setting('t.co_a')::uuid,'00000000-0000-0000-0000-00000000000c','admin');
    raise exception 'FAIL: B a changé un rôle chez A';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- 5. Dernier propriétaire protégé
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','a@a.test');
do $$ begin
  begin perform public.remove_member(current_setting('t.co_a')::uuid,'00000000-0000-0000-0000-00000000000a');
    raise exception 'FAIL: dernier propriétaire retiré';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- 6. Anonyme : aucun accès
reset role; set local role anon;
do $$ begin
  begin perform count(*) from public.companies; raise exception 'FAIL: anon lit companies';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
rollback;
select 'RLS OK' as resultat;
