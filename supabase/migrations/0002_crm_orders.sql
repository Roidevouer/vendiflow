-- VendiFlow 0002 : CRM, pipeline, catalogue, commandes, paiements (montants en unités mineures : FCFA entiers, EUR en centimes)
create type public.order_status as enum ('draft','confirmed','fulfilled','cancelled');
create type public.payment_status as enum ('pending','confirmed','failed');
create type public.stage_kind as enum ('open','won','lost');

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 160),
  phone text check (phone ~ '^\+[1-9][0-9]{6,14}$'),          -- format E.164
  email text check (email = lower(email)),
  source text, notes text, tags text[] not null default '{}',
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (company_id, id)
);
create unique index contacts_phone_uq on public.contacts (company_id, phone) where phone is not null and archived_at is null;
create index on public.contacts (company_id, full_name);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, contact_id uuid not null,
  channel text not null default 'whatsapp', purpose text not null default 'marketing',
  granted boolean not null, evidence text,                       -- preuve : "formulaire web 2026-10-25", etc.
  recorded_at timestamptz not null default now(), created_at timestamptz not null default now(),
  foreign key (company_id, contact_id) references public.contacts (company_id, id) on delete cascade
);
create index on public.consents (company_id, contact_id, channel, purpose, recorded_at desc);  -- le dernier enregistrement fait foi

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, position int not null, kind public.stage_kind not null default 'open',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (company_id, id), unique (company_id, position) deferrable initially deferred
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, contact_id uuid not null, stage_id uuid not null,
  title text not null, amount_minor bigint not null default 0 check (amount_minor >= 0),
  closed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, contact_id) references public.contacts (company_id, id),
  foreign key (company_id, stage_id) references public.pipeline_stages (company_id, id)
);
create index on public.opportunities (company_id, stage_id);

create table public.opportunity_stage_history (
  id bigint generated always as identity primary key,
  company_id uuid not null, opportunity_id uuid not null,
  from_stage_id uuid, to_stage_id uuid not null, changed_by uuid, changed_at timestamptz not null default now(),
  foreign key (company_id, opportunity_id) references public.opportunities (company_id, id) on delete cascade
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reference text not null, name text not null, description text, image_path text,
  price_minor bigint not null check (price_minor >= 0), available boolean not null default true, archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (company_id, id), unique (company_id, reference)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, contact_id uuid not null, number bigint not null,
  status public.order_status not null default 'draft',
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  subtotal_minor bigint not null default 0, total_minor bigint not null default 0,   -- calculés par trigger, jamais par le client
  notes text, created_by uuid default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (company_id, id), unique (company_id, number),
  foreign key (company_id, contact_id) references public.contacts (company_id, id)
);
create index on public.orders (company_id, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, order_id uuid not null, product_id uuid,
  name text, unit_price_minor bigint not null check (unit_price_minor >= 0),
  quantity int not null check (quantity > 0), line_total_minor bigint not null default 0,
  created_at timestamptz not null default now(),
  foreign key (company_id, order_id) references public.orders (company_id, id) on delete cascade,
  foreign key (company_id, product_id) references public.products (company_id, id)
);
create index on public.order_items (order_id);

create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, order_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0), status public.payment_status not null default 'pending',
  method text, provider_ref text, paid_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (company_id, order_id) references public.orders (company_id, id),
  unique (company_id, provider_ref)                                -- idempotence des paiements
);

-- ===== Triggers =====
do $$ declare t text; begin
  foreach t in array array['contacts','pipeline_stages','opportunities','products','orders','order_payments'] loop
    execute format('create trigger trg_%s_upd before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop; end $$;

create function public.seed_stages() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.pipeline_stages (company_id, name, position, kind) values
    (new.id,'Nouveau prospect',1,'open'),(new.id,'Contacté',2,'open'),(new.id,'Intéressé',3,'open'),
    (new.id,'Négociation',4,'open'),(new.id,'Gagné',5,'won'),(new.id,'Perdu',6,'lost');
  return new;
end $$;
create trigger trg_seed_stages after insert on public.companies for each row execute function public.seed_stages();

create function public.opp_before() returns trigger language plpgsql as $$
declare k public.stage_kind;
begin
  select kind into k from public.pipeline_stages where id = new.stage_id;
  new.closed_at := case when k in ('won','lost') then coalesce(old.closed_at, now()) else null end;
  return new;
end $$;
create trigger trg_opp_before before insert or update of stage_id on public.opportunities for each row execute function public.opp_before();

create function public.opp_history() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    insert into public.opportunity_stage_history (company_id, opportunity_id, from_stage_id, to_stage_id, changed_by)
    values (new.company_id, new.id, case when tg_op = 'UPDATE' then old.stage_id end, new.stage_id, auth.uid());
  end if; return null;
end $$;
create trigger trg_opp_history after insert or update of stage_id on public.opportunities for each row execute function public.opp_history();

create function public.order_before() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext(new.company_id::text));
    new.number := coalesce((select max(number) from public.orders where company_id = new.company_id), 0) + 1;
    new.subtotal_minor := 0;
  elsif current_setting('app.recompute', true) is distinct from 'on' then
    new.subtotal_minor := old.subtotal_minor; new.number := old.number; new.company_id := old.company_id;
  end if;
  new.total_minor := greatest(new.subtotal_minor - new.discount_minor, 0);
  return new;
end $$;
create trigger trg_order_before before insert or update on public.orders for each row execute function public.order_before();

create function public.item_before() returns trigger language plpgsql as $$
declare p public.products;
begin
  if tg_op = 'UPDATE' and new.order_id <> old.order_id then raise exception 'order_immutable'; end if;
  if new.product_id is not null then
    select * into p from public.products where id = new.product_id;
    if p.archived_at is not null or not p.available then raise exception 'product_unavailable'; end if;
    new.name := coalesce(new.name, p.name);
    new.unit_price_minor := coalesce(new.unit_price_minor, p.price_minor);   -- prix figé à la commande
  end if;
  new.line_total_minor := new.unit_price_minor * new.quantity;
  return new;
end $$;
create trigger trg_item_before before insert or update on public.order_items for each row execute function public.item_before();

create function public.recompute_order(p_order uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.recompute', 'on', true);
  update public.orders o set subtotal_minor = coalesce((select sum(line_total_minor) from public.order_items where order_id = o.id), 0) where o.id = p_order;
  perform set_config('app.recompute', 'off', true);
end $$;
revoke all on function public.recompute_order(uuid) from public, anon, authenticated;

create function public.item_after() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.recompute_order(coalesce(new.order_id, old.order_id)); return null; end $$;
create trigger trg_item_after after insert or update or delete on public.order_items for each row execute function public.item_after();

-- ===== Indicateurs : commandé ≠ encaissé =====
create view public.company_revenue with (security_invoker = true) as
select c.id as company_id,
  coalesce((select sum(total_minor) from public.orders o where o.company_id = c.id and o.status <> 'cancelled'), 0) as ordered_minor,
  coalesce((select sum(amount_minor) from public.order_payments p where p.company_id = c.id and p.status = 'confirmed'), 0) as collected_minor
from public.companies c;

-- ===== RLS : lecture viewer, écriture sales, suppression admin =====
do $$ declare t text; begin
  foreach t in array array['contacts','consents','pipeline_stages','opportunities','opportunity_stage_history','products','orders','order_items','order_payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_role(company_id))', t||'_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_role(company_id,''sales''))', t||'_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_role(company_id,''sales'')) with check (public.has_role(company_id,''sales''))', t||'_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.has_role(company_id,''admin''))', t||'_del', t);
  end loop; end $$;
revoke insert, update, delete on public.opportunity_stage_history from authenticated;
revoke all on public.company_revenue from anon;
