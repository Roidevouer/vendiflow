-- VendiFlow 0001 : socle multi-tenant (identité, rôles, invitations, audit) + RLS
create extension if not exists pgcrypto with schema extensions;

create type public.member_role as enum ('owner','admin','sales','viewer');

create function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  currency text not null default 'XOF' check (currency in ('XOF','EUR')),
  timezone text not null default 'Africa/Abidjan',
  logo_path text,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);
create index on public.memberships (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null check (email = lower(email)),
  role public.member_role not null check (role <> 'owner'),
  token_hash text not null unique,            -- sha256 hex ; le jeton brut n'est jamais stocké
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.invitations (company_id);

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  company_id uuid references public.companies(id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity text,
  entity_id text,
  meta jsonb not null default '{}',            -- jamais de secrets ni de contenu de messages
  created_at timestamptz not null default now()
);
create index on public.audit_logs (company_id, created_at desc);

create trigger trg_companies_upd before update on public.companies for each row execute function public.set_updated_at();
create trigger trg_profiles_upd before update on public.profiles for each row execute function public.set_updated_at();
create trigger trg_memberships_upd before update on public.memberships for each row execute function public.set_updated_at();
create trigger trg_invitations_upd before update on public.invitations for each row execute function public.set_updated_at();

-- ===== Fonctions d'autorisation =====
create function public.role_rank(r public.member_role) returns int language sql immutable as
$$ select case r when 'owner' then 4 when 'admin' then 3 when 'sales' then 2 else 1 end $$;

create function public.has_role(p_company uuid, p_min public.member_role default 'viewer')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m join public.companies c on c.id = m.company_id
    where m.company_id = p_company and m.user_id = auth.uid()
      and c.deleted_at is null and public.role_rank(m.role) >= public.role_rank(p_min));
$$;

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.platform_admins where user_id = auth.uid()) $$;

create function public.write_audit(p_company uuid, p_action text, p_entity text, p_entity_id text, p_meta jsonb default '{}')
returns void language sql security definer set search_path = public as
$$ insert into public.audit_logs (company_id, actor_id, action, entity, entity_id, meta)
   values (p_company, auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_meta,'{}')) $$;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.guard_last_owner() returns trigger language plpgsql as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (select 1 from public.memberships
                     where company_id = old.company_id and role = 'owner' and id <> old.id) then
    raise exception 'last_owner' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_guard_last_owner before update of role or delete on public.memberships
  for each row execute function public.guard_last_owner();

-- ===== RPC (seul chemin d'écriture sur les appartenances) =====
create function public.create_company(p_name text, p_currency text default 'XOF', p_timezone text default 'Africa/Abidjan')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.companies (name, currency, timezone, created_by)
    values (trim(p_name), p_currency, p_timezone, auth.uid()) returning id into v_id;
  insert into public.memberships (company_id, user_id, role) values (v_id, auth.uid(), 'owner');
  perform public.write_audit(v_id, 'company.created', 'company', v_id::text);
  return v_id;
end $$;

create function public.change_member_role(p_company uuid, p_user uuid, p_role public.member_role)
returns void language plpgsql security definer set search_path = public as $$
declare v_old public.member_role;
begin
  if not public.has_role(p_company, 'admin') then raise exception 'forbidden'; end if;
  select role into v_old from public.memberships where company_id = p_company and user_id = p_user;
  if v_old is null then raise exception 'not_found'; end if;
  if (p_role = 'owner' or v_old = 'owner') and not public.has_role(p_company, 'owner') then
    raise exception 'forbidden';
  end if;
  update public.memberships set role = p_role where company_id = p_company and user_id = p_user;
  perform public.write_audit(p_company, 'member.role_changed', 'user', p_user::text,
          jsonb_build_object('from', v_old, 'to', p_role));
end $$;

create function public.remove_member(p_company uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_role public.member_role;
begin
  select role into v_role from public.memberships where company_id = p_company and user_id = p_user;
  if v_role is null then raise exception 'not_found'; end if;
  if p_user <> auth.uid() then
    if not public.has_role(p_company, 'admin') then raise exception 'forbidden'; end if;
    if v_role = 'owner' and not public.has_role(p_company, 'owner') then raise exception 'forbidden'; end if;
  end if;
  delete from public.memberships where company_id = p_company and user_id = p_user;
  perform public.write_audit(p_company, 'member.removed', 'user', p_user::text);
end $$;

create function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v public.invitations; v_email text := lower(auth.jwt()->>'email');
begin
  select * into v from public.invitations
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and accepted_at is null and expires_at > now() and email = v_email;
  if v.id is null then raise exception 'invitation_invalid'; end if;
  insert into public.memberships (company_id, user_id, role) values (v.company_id, auth.uid(), v.role)
    on conflict (company_id, user_id) do nothing;
  update public.invitations set accepted_at = now(), accepted_by = auth.uid() where id = v.id;
  perform public.write_audit(v.company_id, 'invitation.accepted', 'invitation', v.id::text);
  return v.company_id;
end $$;

-- ===== Droits d'exécution =====
revoke all on function public.write_audit(uuid,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.create_company(text,text,text), public.change_member_role(uuid,uuid,public.member_role),
  public.remove_member(uuid,uuid), public.accept_invitation(text) from public, anon;
grant execute on function public.create_company(text,text,text), public.change_member_role(uuid,uuid,public.member_role),
  public.remove_member(uuid,uuid), public.accept_invitation(text), public.has_role(uuid,public.member_role),
  public.is_platform_admin() to authenticated;

-- ===== RLS =====
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.platform_admins enable row level security;
alter table public.audit_logs enable row level security;
revoke all on all tables in schema public from anon;

create policy companies_select on public.companies for select to authenticated using (public.has_role(id));
create policy companies_update on public.companies for update to authenticated
  using (public.has_role(id,'admin')) with check (public.has_role(id,'admin'));

create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (select 1 from public.memberships a join public.memberships b on a.company_id = b.company_id
                             where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy memberships_select on public.memberships for select to authenticated using (public.has_role(company_id));

create policy invitations_select on public.invitations for select to authenticated using (public.has_role(company_id,'admin'));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (public.has_role(company_id,'admin') and invited_by = auth.uid());
create policy invitations_delete on public.invitations for delete to authenticated
  using (public.has_role(company_id,'admin') and accepted_at is null);

create policy audit_select on public.audit_logs for select to authenticated using (public.has_role(company_id,'admin'));
revoke insert, update, delete, truncate on public.audit_logs from authenticated;
revoke insert, update, delete on public.memberships from authenticated;
