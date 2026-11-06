-- ============================================================
-- Ops Flash Report — 00008_guest_access.sql
-- Admin / guest role model + temporary one-time guest grants.
--
-- Roles live in public.profiles; guest access is a one-time grant
-- (public.guest_grants) that an admin issues via the manage-guests
-- Edge Function. RLS on SBU-scoped tables is narrowed from
-- "any authenticated user" to "admin OR guest with an active grant
-- covering that SBU". Guest auth users are created/disabled by the
-- Edge Function (service role); this migration only adds the data
-- model + RLS that enforce access while a session is alive.
-- ============================================================

-- ------------------------------------------------------------
-- Profiles: role per auth user. Bootstrap: the first user to sign
-- in becomes admin; everyone after is a guest (see ensure_profile).
-- ------------------------------------------------------------
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  role         text not null default 'guest' check (role in ('admin', 'guest')),
  display_name text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Backfill: every existing auth user predates the role model, so they
-- keep full access as admin. New sign-ins after this are resolved by
-- ensure_profile() (bootstrap admin / guest).
insert into public.profiles (user_id, role)
select id, 'admin' from auth.users
on conflict (user_id) do nothing;

-- ------------------------------------------------------------
-- Guest grants: one row per issued temporary access.
-- username is the login name; the auth email is derived from it by
-- the app/Edge Function. allowed_sbus limits what the guest can read.
-- status: active -> used (on logout) / expired (time) / revoked (admin).
-- ------------------------------------------------------------
create table if not exists public.guest_grants (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  username      text not null unique,
  link_token    text not null unique,
  allowed_sbus  integer[] not null default '{}',
  expires_at    timestamptz not null,
  status        text not null default 'active'
                check (status in ('active', 'used', 'expired', 'revoked')),
  created_by    uuid,
  first_login_at timestamptz,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_guest_grants_user on public.guest_grants (user_id);
create index if not exists idx_guest_grants_status on public.guest_grants (status, expires_at);

-- ------------------------------------------------------------
-- RLS on the new tables (defense in depth; the SECURITY DEFINER
-- helpers below bypass RLS to resolve role + allowed SBUs).
-- ------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.guest_grants enable row level security;

create policy "profiles_self" on public.profiles
  for select to authenticated using (user_id = auth.uid());

create policy "guest_grants_self" on public.guest_grants
  for select to authenticated using (user_id = auth.uid());

-- ------------------------------------------------------------
-- Helpers (SECURITY DEFINER, so they read profiles/guest_grants
-- regardless of RLS, and auth.uid() still resolves to the caller).
-- ------------------------------------------------------------
create or replace function public.auth_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select coalesce((select p.role from public.profiles p where p.user_id = auth.uid()), 'guest');
$$;

create or replace function public.auth_is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select p.role = 'admin' from public.profiles p where p.user_id = auth.uid()), false);
$$;

create or replace function public.auth_allowed_sbus()
returns integer[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select g.allowed_sbus
       from public.guest_grants g
      where g.user_id = auth.uid()
        and g.status = 'active'
        and g.expires_at > now()
      order by g.created_at desc
      limit 1),
    '{}'::integer[]
  );
$$;

-- ------------------------------------------------------------
-- ensure_profile(): idempotent role resolution. The very first user
-- to sign in becomes admin (bootstrap); later users default to guest.
-- ------------------------------------------------------------
create or replace function public.ensure_profile()
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  r text;
  admins int;
begin
  select p.role into r from public.profiles p where p.user_id = auth.uid();
  if r is null then
    select count(*) into admins from public.profiles where role = 'admin';
    r := case when admins = 0 then 'admin' else 'guest' end;

    insert into public.profiles (user_id, role)
    values (auth.uid(), r)
    on conflict (user_id) do nothing;
  end if;

  if r = 'guest' then
    update public.guest_grants g
       set first_login_at = coalesce(g.first_login_at, now())
     where g.user_id = auth.uid();
  end if;

  return r;
end;
$$;

-- ------------------------------------------------------------
-- guest_mark_used(): the client calls this on sign-out so the
-- one-time passcode stops working immediately (RLS then denies).
-- ------------------------------------------------------------
create or replace function public.guest_mark_used()
returns void
language sql security definer
set search_path = public
as $$
  update public.guest_grants g
     set status = 'used', used_at = now()
   where g.user_id = auth.uid()
     and g.status = 'active';
$$;

-- ------------------------------------------------------------
-- Narrow RLS on SBU-scoped tables: admin sees all; a guest sees only
-- their allowed SBUs while their grant is active + unexpired.
-- ------------------------------------------------------------

-- sbu dimension (column: id)
drop policy if exists "sbu_select" on public.sbu;
create policy "sbu_select" on public.sbu
  for select to authenticated
  using (public.auth_is_admin() or id = ANY(public.auth_allowed_sbus()));

-- monthly targets (column: sbu_id)
drop policy if exists "target_select" on public.target;
create policy "target_select" on public.target
  for select to authenticated
  using (public.auth_is_admin() or sbu_id = ANY(public.auth_allowed_sbus()));

-- daily snapshot
drop policy if exists "snapshot_select" on public.daily_snapshot;
create policy "snapshot_select" on public.daily_snapshot
  for select to authenticated
  using (public.auth_is_admin() or sbu_id = ANY(public.auth_allowed_sbus()));

-- daily trend
drop policy if exists "trend_select" on public.daily_trend;
create policy "trend_select" on public.daily_trend
  for select to authenticated
  using (public.auth_is_admin() or sbu_id = ANY(public.auth_allowed_sbus()));

-- SKU-level daily sales (Advanced Analysis)
drop policy if exists "sku_sales_select" on public.sku_sales_daily;
create policy "sku_sales_select" on public.sku_sales_daily
  for select to authenticated
  using (public.auth_is_admin() or sbu_id = ANY(public.auth_allowed_sbus()));

-- 4-FY forecast history
drop policy if exists "sbu_daily_history_select" on public.sbu_daily_history;
create policy "sbu_daily_history_select" on public.sbu_daily_history
  for select to authenticated
  using (public.auth_is_admin() or sbu_id = ANY(public.auth_allowed_sbus()));

-- overrides are admin-only (per-SBU corrections + notes)
drop policy if exists "override_select" on public.override;
create policy "override_select" on public.override
  for select to authenticated
  using (public.auth_is_admin());

-- item_master / reconciliation / refresh_run remain readable by any
-- authenticated user: SKU names are needed by guests, and the other
-- two are portfolio-level (no per-SBU leak) + the freshness badge.
