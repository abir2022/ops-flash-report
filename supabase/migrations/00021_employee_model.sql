-- ============================================================
-- Ops Flash Report — 00021_employee_model.sql
-- Replace the three-role model (admin / guest / officer) with a
-- two-role model (admin / employee).
--
--   * public.profiles.role now only allows 'admin' | 'employee'.
--   * public.employees: one row per non-admin account (name, email,
--     phone, allowed_sbus int[], capabilities, plaintext password,
--     optional view expiry, is_active).
--   * Capabilities are two independent booleans:
--       can_view  -> the old "guest" read-only SBU view (Advanced
--                    Analysis + Business Impact Radar), scoped to
--                    allowed_sbus and gated by expires_at.
--       can_romi  -> the old "officer" campaign entry form.
--     Admin picks a single 3-way capability: view / romi / both.
--   * Guests are NOT migrated (admins recreate them manually as
--     employees). Officers ARE migrated (can_romi = true).
--   * Magic guest links + one-time passcodes are removed.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Employees table (replaces officer_profiles + guest_grants).
-- ------------------------------------------------------------
create table if not exists public.employees (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  name           text not null,
  email          text not null,
  phone          text,
  allowed_sbus   integer[] not null default '{}',
  can_view       boolean not null default true,
  can_romi       boolean not null default false,
  password_plain text,
  expires_at     timestamptz,
  is_active      boolean not null default true,
  created_by     uuid,
  created_at     timestamptz not null default now()
);

create index if not exists idx_employees_sbus
  on public.employees using gin (allowed_sbus);

alter table public.employees enable row level security;

create policy "employees_self" on public.employees
  for select to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------
-- 2. Migrate officers -> employees (can_romi, no view).
-- ------------------------------------------------------------
insert into public.employees
  (user_id, name, email, phone, allowed_sbus, can_view, can_romi,
   password_plain, is_active, created_by, created_at)
select o.user_id, o.name, o.email, o.phone, o.sbu_ids, false, true,
       o.password_plain, o.is_active, o.created_by, o.created_at
from public.officer_profiles o
on conflict (user_id) do nothing;

-- ------------------------------------------------------------
-- 3. Remap profiles.role: officer -> employee; drop guests.
--    Guests are intentionally not carried over (recreate manually).
--    Order matters: drop the check first (so 'employee' is allowed),
--    remove guests, remap officers, then re-add the two-role check.
-- ------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;

delete from auth.users u
where u.id in (select p.user_id from public.profiles p where p.role = 'guest')
   or u.email like '%@guest.opsflash.app';

delete from public.profiles p where p.role = 'guest';

update public.profiles set role = 'employee' where role = 'officer';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_role_check
      check (role in ('admin', 'employee'));
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 4. Helpers (SECURITY DEFINER; read employees regardless of RLS).
-- ------------------------------------------------------------
create or replace function public.auth_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select coalesce((select p.role from public.profiles p where p.user_id = auth.uid()), 'employee');
$$;

create or replace function public.auth_is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select p.role = 'admin' from public.profiles p where p.user_id = auth.uid()), false);
$$;

create or replace function public.auth_is_employee()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select p.role = 'employee' from public.profiles p where p.user_id = auth.uid()), false);
$$;

create or replace function public.auth_employee_active()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select e.is_active from public.employees e where e.user_id = auth.uid()), false);
$$;

create or replace function public.auth_can_view()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select e.can_view and e.is_active
           and (e.expires_at is null or e.expires_at > now())
      from public.employees e
     where e.user_id = auth.uid()
  ), false);
$$;

create or replace function public.auth_can_romi()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select e.can_romi and e.is_active
      from public.employees e
     where e.user_id = auth.uid()
  ), false);
$$;

create or replace function public.auth_allowed_sbus()
returns integer[]
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select e.allowed_sbus
      from public.employees e
     where e.user_id = auth.uid()
       and e.is_active and e.can_view
       and (e.expires_at is null or e.expires_at > now())
  ), '{}'::integer[]);
$$;

-- ------------------------------------------------------------
-- 5. ensure_profile(): bootstrap first sign-in as admin, everyone
--    after defaults to employee (no self-registration UI exists).
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
    r := case when admins = 0 then 'admin' else 'employee' end;
    insert into public.profiles (user_id, role)
    values (auth.uid(), r)
    on conflict (user_id) do nothing;
  end if;
  return r;
end;
$$;

-- ------------------------------------------------------------
-- 6. Admin RPCs — employee lifecycle.
-- ------------------------------------------------------------
create or replace function public.admin_create_employee(
  _name text,
  _email text,
  _phone text,
  _allowed_sbus integer[],
  _capability text,
  _password text,
  _expires_at timestamptz default null
)
returns table (
  user_id uuid, name text, email text,
  allowed_sbus integer[], can_view boolean, can_romi boolean
)
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_user uuid;
  v_bad integer;
  v_view boolean;
  v_romi boolean;
begin
  if not public.auth_is_admin() then
    raise exception 'forbidden';
  end if;

  _name       := btrim(_name);
  _email      := lower(btrim(_email));
  _phone      := btrim(coalesce(_phone, ''));
  _allowed_sbus := coalesce(_allowed_sbus, '{}'::integer[]);
  _capability := lower(btrim(coalesce(_capability, 'view')));

  if length(_name) < 2 then
    raise exception 'Name is required.';
  end if;
  if _email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email is required.';
  end if;
  if coalesce(_password, '') = '' or length(_password) < 8 then
    raise exception 'Password must be at least 8 characters.';
  end if;
  if coalesce(array_length(_allowed_sbus, 1), 0) = 0 then
    raise exception 'Select at least one SBU.';
  end if;
  if _capability not in ('view', 'romi', 'both') then
    raise exception 'Capability must be view, romi or both.';
  end if;
  if exists (select 1 from public.employees e where lower(e.email) = _email) then
    raise exception 'An employee with this email already exists.';
  end if;
  if exists (select 1 from auth.users u where u.email = _email and u.is_sso_user = false) then
    raise exception 'This email is already registered as a user.';
  end if;

  select count(*) into v_bad
  from unnest(_allowed_sbus) x(id)
  where not exists (select 1 from public.sbu s where s.id = x.id);
  if v_bad > 0 then
    raise exception 'One or more SBUs do not exist.';
  end if;

  v_view := _capability in ('view', 'both');
  v_romi := _capability in ('romi', 'both');
  v_user := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user, 'authenticated', 'authenticated', _email,
    crypt(_password, gen_salt('bf', 10)),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('role', 'employee', 'name', _name),
    now(), now(),
    '', '', '', '', false, false
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at, id
  ) values (
    v_user, v_user,
    jsonb_build_object('sub', v_user, 'email', _email, 'email_verified', true),
    'email', now(), now(), now(), gen_random_uuid()
  );

  insert into public.profiles (user_id, role, display_name)
  values (v_user, 'employee', _name)
  on conflict on constraint profiles_pkey
  do update set role = 'employee', display_name = excluded.display_name;

  insert into public.employees
    (user_id, name, email, phone, allowed_sbus, can_view, can_romi,
     password_plain, expires_at, created_by)
  values
    (v_user, _name, _email, _phone, _allowed_sbus, v_view, v_romi,
     _password, _expires_at, auth.uid());

  return query select v_user, _name, _email, _allowed_sbus, v_view, v_romi;
end;
$$;

create or replace function public.admin_list_employees()
returns table (
  user_id uuid,
  name text,
  email text,
  phone text,
  password text,
  allowed_sbus integer[],
  sbu_codes text[],
  sbu_names text[],
  capability text,
  can_view boolean,
  can_romi boolean,
  is_active boolean,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.auth_is_admin() then
    raise exception 'forbidden';
  end if;
  return query
    select e.user_id, e.name, e.email, e.phone, e.password_plain,
           e.allowed_sbus,
           coalesce((select array_agg(s.code order by s.id) from public.sbu s where s.id = any(e.allowed_sbus)), '{}'::text[]) as sbu_codes,
           coalesce((select array_agg(s.name order by s.id) from public.sbu s where s.id = any(e.allowed_sbus)), '{}'::text[]) as sbu_names,
           case when e.can_view and e.can_romi then 'both'
                when e.can_view then 'view'
                else 'romi' end as capability,
           e.can_view, e.can_romi, e.is_active, e.expires_at, e.created_at
    from public.employees e
    order by e.created_at desc;
end;
$$;

create or replace function public.admin_revoke_employee(_user_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.auth_is_admin() then
    raise exception 'forbidden';
  end if;
  update public.employees e set is_active = false where e.user_id = _user_id;
  update public.profiles p set is_active = false where p.user_id = _user_id;
end;
$$;

create or replace function public.admin_reactivate_employee(_user_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.auth_is_admin() then
    raise exception 'forbidden';
  end if;
  update public.employees e set is_active = true where e.user_id = _user_id;
  update public.profiles p set is_active = true where p.user_id = _user_id;
end;
$$;

create or replace function public.admin_reset_employee_password(
  _user_id uuid,
  _password text default null
)
returns table (email text, password text)
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_email text;
  v_password text;
begin
  if not public.auth_is_admin() then
    raise exception 'forbidden';
  end if;

  select e.email into v_email from public.employees e where e.user_id = _user_id;
  if not found then
    raise exception 'Employee not found.';
  end if;

  v_password := coalesce(nullif(_password, ''), public.gen_passcode(10));
  if length(v_password) < 8 then
    raise exception 'Password must be at least 8 characters.';
  end if;

  update auth.users u
     set encrypted_password = crypt(v_password, gen_salt('bf', 10)), updated_at = now()
   where u.id = _user_id;
  update public.employees e
     set password_plain = v_password
   where e.user_id = _user_id;

  return query select v_email, v_password;
end;
$$;

create or replace function public.admin_delete_employee(_user_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.auth_is_admin() then
    raise exception 'forbidden';
  end if;
  delete from public.employees e where e.user_id = _user_id;
  delete from auth.users u where u.id = _user_id;
end;
$$;

-- ------------------------------------------------------------
-- 7. Employee RPCs — self-service (campaign entry for can_romi).
-- ------------------------------------------------------------
create or replace function public.employee_profile()
returns table (
  name text,
  email text,
  phone text,
  allowed_sbus integer[],
  sbu_codes text[],
  sbu_names text[],
  can_view boolean,
  can_romi boolean
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.auth_is_employee() then
    raise exception 'forbidden';
  end if;
  return query
    select e.name, e.email, e.phone,
           e.allowed_sbus,
           coalesce((select array_agg(s.code order by s.id) from public.sbu s where s.id = any(e.allowed_sbus)), '{}'::text[]) as sbu_codes,
           coalesce((select array_agg(s.name order by s.id) from public.sbu s where s.id = any(e.allowed_sbus)), '{}'::text[]) as sbu_names,
           e.can_view, e.can_romi
    from public.employees e
    where e.user_id = auth.uid();
end;
$$;

create or replace function public.employee_submit_campaign(
  _sbu_id integer,
  _campaign_name text,
  _category text,
  _start_date date,
  _end_date date,
  _marketing_expense_total double precision,
  _extra_fields jsonb default null
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
  v_bu bigint;
  v_id bigint;
begin
  if not public.auth_is_employee() then
    raise exception 'forbidden';
  end if;
  if not public.auth_can_romi() then
    raise exception 'This account cannot submit campaigns.';
  end if;

  select * into v_employee from public.employees e where e.user_id = auth.uid();
  if not found then
    raise exception 'Employee profile not found.';
  end if;

  if not (_sbu_id = any(v_employee.allowed_sbus)) then
    raise exception 'This SBU is not assigned to you.';
  end if;
  if coalesce(btrim(_campaign_name), '') = '' then
    raise exception 'Campaign name is required.';
  end if;
  if _start_date is null or _end_date is null or _end_date < _start_date then
    raise exception 'Invalid campaign dates.';
  end if;
  if coalesce(_marketing_expense_total, 0) <= 0 then
    raise exception 'Marketing expense must be greater than zero.';
  end if;

  select m.business_unit_id into v_bu
  from public.sbu_romi_map m
  where m.sbu_id = _sbu_id;
  if v_bu is null then
    raise exception 'This SBU is not mapped to a ROMI business unit yet.';
  end if;

  insert into public.romi_campaign (
    business_unit_id, campaign_name, category, report_month,
    start_date, end_date, officer_name, officer_enroll,
    marketing_expense_total, extra_fields
  ) values (
    v_bu, btrim(_campaign_name), btrim(coalesce(_category, 'Other')),
    to_char(_end_date, 'YYYY-MM'),
    _start_date, _end_date, v_employee.name, v_employee.email,
    _marketing_expense_total, _extra_fields
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.employee_list_campaigns()
returns table (
  id bigint,
  sbu_id integer,
  sbu_code text,
  sbu_name text,
  campaign_name text,
  category text,
  report_month text,
  start_date date,
  end_date date,
  marketing_expense_total double precision,
  created_at timestamptz
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_sbu_ids integer[];
begin
  if not public.auth_is_employee() then
    raise exception 'forbidden';
  end if;
  select e.allowed_sbus into v_sbu_ids from public.employees e where e.user_id = auth.uid();

  return query
    select rc.id, m.sbu_id, s.code, s.name, rc.campaign_name, rc.category,
           rc.report_month, rc.start_date, rc.end_date,
           rc.marketing_expense_total, rc.created_at
    from public.romi_campaign rc
    join public.sbu_romi_map m on m.business_unit_id = rc.business_unit_id
    join public.sbu s on s.id = m.sbu_id
    where m.sbu_id = any(v_sbu_ids)
    order by rc.created_at desc;
end;
$$;

-- ------------------------------------------------------------
-- 8. Survey form readability: admin (00013) OR can_romi employee.
-- ------------------------------------------------------------
drop policy if exists "romi_survey_form_officer_select" on public.romi_survey_form;
create policy "romi_survey_form_employee_select" on public.romi_survey_form
  for select to authenticated
  using (public.auth_can_romi());

-- ------------------------------------------------------------
-- 9. Drop superseded guest / officer objects.
-- ------------------------------------------------------------
drop function if exists public.guest_mark_used();
drop function if exists public.auth_is_officer();
drop function if exists public.auth_officer_active();

drop function if exists public.admin_create_guest(text, integer[], timestamptz, text);
drop function if exists public.admin_list_grants();
drop function if exists public.admin_revoke_guest(uuid);
drop function if exists public.admin_reset_guest(uuid, timestamptz);
drop function if exists public.admin_delete_guest(uuid);

drop function if exists public.admin_create_officer(text, text, text, integer[], text);
drop function if exists public.admin_list_officers();
drop function if exists public.admin_revoke_officer(uuid);
drop function if exists public.admin_reactivate_officer(uuid);
drop function if exists public.admin_reset_officer_password(uuid, text);
drop function if exists public.admin_delete_officer(uuid);

drop function if exists public.officer_profile();
drop function if exists public.officer_submit_campaign(integer, text, text, date, date, double precision, jsonb);
drop function if exists public.officer_list_campaigns();

drop table if exists public.guest_grants;
drop table if exists public.officer_profiles;
