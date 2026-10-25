-- Exécution : psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_phase2.sql  (après db reset)
begin;
create function pg_temp.as_user(u uuid, e text) returns void language plpgsql as $$
begin reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated','email',e)::text, true);
  set local role authenticated; end $$;
insert into auth.users (id,email) values ('00000000-0000-0000-0000-00000000000a','a@a.test'),
 ('00000000-0000-0000-0000-00000000000b','b@b.test'),('00000000-0000-0000-0000-00000000000c','c@c.test');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','a@a.test');
select set_config('t.co_a', public.create_company('Alpha')::text, true);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b','b@b.test');
select set_config('t.co_b', public.create_company('Beta')::text, true);

-- 1. Étapes par défaut, calculs serveur, encaissé vs commandé
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','a@a.test');
do $$ declare c uuid; o uuid; co uuid := current_setting('t.co_a')::uuid; begin
  assert (select count(*) from public.pipeline_stages) = 6, '6 étapes par défaut';
  insert into public.contacts (company_id, full_name, phone, source) values (co,'Awa Kouassi','+2250700000001','whatsapp') returning id into c;
  insert into public.products (company_id, reference, name, price_minor) values (co,'REF1','Pagne',5000);
  insert into public.orders (company_id, contact_id, discount_minor, subtotal_minor, total_minor) values (co,c,1000,999999,999999) returning id into o;
  insert into public.order_items (company_id, order_id, product_id, quantity) select co,o,id,3 from public.products where reference='REF1';
  assert (select subtotal_minor from public.orders where id=o) = 15000, 'sous-total serveur';
  assert (select total_minor from public.orders where id=o) = 14000, 'total = sous-total - remise';
  update public.orders set subtotal_minor = 1, total_minor = 1 where id = o;
  assert (select total_minor from public.orders where id=o) = 14000, 'total non falsifiable';
  assert (select number from public.orders where id=o) = 1, 'numérotation';
  insert into public.order_payments (company_id, order_id, amount_minor, status, provider_ref) values (co,o,5000,'confirmed','p1'),(co,o,9000,'pending','p2');
  assert (select collected_minor from public.company_revenue where company_id=co) = 5000, 'encaissé = paiements confirmés';
  assert (select ordered_minor from public.company_revenue where company_id=co) = 14000, 'commandé';
  begin insert into public.order_payments (company_id, order_id, amount_minor, provider_ref) values (co,o,5000,'p1');
    raise exception 'FAIL: doublon de paiement accepté';
  exception when unique_violation then null; end;
  perform set_config('t.contact', c::text, true);
end $$;

-- 2. Historique du pipeline
do $$ declare co uuid := current_setting('t.co_a')::uuid; op uuid; begin
  insert into public.opportunities (company_id, contact_id, stage_id, title)
    select co, current_setting('t.contact')::uuid, id, 'Gros contrat' from public.pipeline_stages where company_id=co and position=1 returning id into op;
  update public.opportunities set stage_id = (select id from public.pipeline_stages where company_id=co and kind='won') where id = op;
  assert (select count(*) from public.opportunity_stage_history where opportunity_id=op) = 2, 'historique créé + déplacé';
  assert (select closed_at is not null from public.opportunities where id=op), 'closed_at sur étape gagnée';
end $$;

-- 3. Isolation : B ne voit rien de A et ne peut ni écrire chez A ni référencer ses données
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b','b@b.test');
do $$ begin
  assert (select count(*) from public.contacts) = 0, 'contacts isolés';
  assert (select count(*) from public.orders) = 0, 'commandes isolées';
  assert (select count(*) from public.company_revenue) = 1, 'revenus : sa propre société seulement';
  begin insert into public.contacts (company_id, full_name) values (current_setting('t.co_a')::uuid,'Intrus');
    raise exception 'FAIL: B a écrit chez A';
  exception when insufficient_privilege then null; when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin insert into public.orders (company_id, contact_id) values (current_setting('t.co_b')::uuid, current_setting('t.contact')::uuid);
    raise exception 'FAIL: contact d''une autre société référencé';
  exception when foreign_key_violation then null; when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;

-- 4. Lecture seule : ne peut pas créer
reset role;
insert into public.memberships (company_id,user_id,role) values (current_setting('t.co_a')::uuid,'00000000-0000-0000-0000-00000000000c','viewer');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c','c@c.test');
do $$ begin
  assert (select count(*) from public.contacts) = 1, 'viewer lit';
  begin insert into public.contacts (company_id, full_name) values (current_setting('t.co_a')::uuid,'X');
    raise exception 'FAIL: viewer a écrit';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role; rollback;
select 'PHASE 2 OK' as resultat;
