-- ============================================================
-- Ops Flash Report — 00014_officer_role.sql
-- Add the "officer" role: marketing officers who log in with their
-- own email + password and submit campaign entries for exactly one
-- responsible SBU. Their name / SBU / enroll are mapped from their
-- profile — they never type them on the form.
--
--   * profiles.role gains 'officer' (check constraint widened).
--   * officer_profiles: one row per officer (name, email, phone,
--     responsible sbu_id, is_active).
--   * romi_campaign gains a nullable extra_fields jsonb column to
--     hold responses to the optional admin-added form fields.
--   * romi_survey_submission is dropped — the fixed campaign form
--     writes straight into romi_campaign (no approval queue).
--   * RPCs: admin_create_officer / admin_list_officers /
--     admin_revoke_officer / officer_profile / officer_submit_campaign /
--     officer_list_campaigns.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Widen profiles.role to include 'officer'.
-- ------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'guest', 'officer'));

-- ------------------------------------------------------------
-- 2. Officer profiles.
-- ------------------------------------------------------------
create table if not exists public.officer_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  email      text not null,
  phone      text,
  sbu_id     integer not null references public.sbu(id) on delete restrict,
  is_active  boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_officer_profiles_sbu
  on public.officer_profiles (sbu_id);

alter table public.officer_profiles enable row level security;

create policy "officer_profiles_self" on public.officer_profiles
  for select to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------
-- 3. romi_campaign.extra_fields (optional admin-added form fields).
-- ------------------------------------------------------------
alter table public.romi_campaign
  add column if not exists extra_fields jsonb;

-- Drop the now-unused approval queue (officers write directly to
-- romi_campaign via officer_submit_campaign; no intermediate table).
drop table if exists public.romi_survey_submission;

-- Officers must read the active survey form definition to render the
-- optional admin-added fields. (The form definition is not sensitive.)
drop policy if exists "romi_survey_form_officer_select" on public.romi_survey_form;
create policy "romi_survey_form_officer_select" on public.romi_survey_form
  for select to authenticated
  using (public.auth_is_officer());

-- ------------------------------------------------------------
-- 4. Helpers.
-- ------------------------------------------------------------
create or replace function public.auth_is_officer()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select p.role = 'officer' from public.profiles p where p.user_id = auth.uid()), false);
$$;

create or replace function public.auth_officer_active()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select o.is_active from public.officer_profiles o where o.user_id = auth.uid()), false);
$$;

-- ------------------------------------------------------------
-- 5. Admin RPCs (officer lifecycle).
-- ------------------------------------------------------------
create or replace function public.admin_create_officer(
  _name text,
  _email text,
  _phone text,
  _sbu_id integer,
  _password text
)
returns table (user_id uuid, name text, email text, sbu_id integer)
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_user uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'forbidden';
  end if;

  _name  := btrim(_name);
  _email := lower(btrim(_email));
  _phone := btrim(coalesce(_phone, ''));

  if length(_name) < 2 then
    raise exception 'Name is required.';
  end if;
  if _email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email is required.';
  end if;
  if coalesce(_password, '') = '' or length(_password) < 8 then
    raise exception 'Password must be at least 8 characters.';
  end if;
  if not exists (select 1 from public.sbu s where s.id = _sbu_id) then
    raise exception 'Unknown SBU.';
  end if;
  if exists (select 1 from public.officer_profiles o where lower(o.email) = _email) then
    raise exception 'An officer with this email already exists.';
  end if;

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
    jsonb_build_object('role', 'officer', 'name', _name),
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
  values (v_user, 'officer', _name)
  on conflict (user_id) do update set role = 'officer', display_name = excluded.display_name;

  insert into public.officer_profiles (user_id, name, email, phone, sbu_id, created_by)
  values (v_user, _name, _email, _phone, _sbu_id, auth.uid());

  return query select v_user, _name, _email, _sbu_id;
end;
$$;

create or replace function public.admin_list_officers()
returns table (
  user_id uuid,
  name text,
  email text,
  phone text,
  sbu_id integer,
  sbu_code text,
  sbu_name text,
  is_active boolean,
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
    select o.user_id, o.name, o.email, o.phone, o.sbu_id,
           s.code as sbu_code, s.name as sbu_name, o.is_active, o.created_at
    from public.officer_profiles o
    join public.sbu s on s.id = o.sbu_id
    order by o.created_at desc;
end;
$$;

create or replace function public.admin_revoke_officer(_user_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.auth_is_admin() then
    raise exception 'forbidden';
  end if;
  update public.officer_profiles o set is_active = false where o.user_id = _user_id;
  update public.profiles p set is_active = false where p.user_id = _user_id;
end;
$$;

create or replace function public.admin_reactivate_officer(_user_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.auth_is_admin() then
    raise exception 'forbidden';
  end if;
  update public.officer_profiles o set is_active = true where o.user_id = _user_id;
  update public.profiles p set is_active = true where p.user_id = _user_id;
end;
$$;

-- ------------------------------------------------------------
-- 6. Officer RPCs (self-service campaign entry).
-- ------------------------------------------------------------
create or replace function public.officer_profile()
returns table (
  name text,
  email text,
  phone text,
  sbu_id integer,
  sbu_code text,
  sbu_name text
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.auth_is_officer() then
    raise exception 'forbidden';
  end if;
  return query
    select o.name, o.email, o.phone, o.sbu_id, s.code as sbu_code, s.name as sbu_name
    from public.officer_profiles o
    join public.sbu s on s.id = o.sbu_id
    where o.user_id = auth.uid();
end;
$$;

-- Officer submits a campaign for their responsible SBU. The officer's
-- name / enroll are taken from their profile; business_unit_id is resolved
-- from their sbu_id via sbu_romi_map; report_month is derived from the
-- campaign end date (matches the existing romi_campaign convention).
create or replace function public.officer_submit_campaign(
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
  v_officer public.officer_profiles%rowtype;
  v_bu bigint;
  v_id bigint;
begin
  if not public.auth_is_officer() then
    raise exception 'forbidden';
  end if;
  if not public.auth_officer_active() then
    raise exception 'Officer account is inactive.';
  end if;

  select * into v_officer from public.officer_profiles o where o.user_id = auth.uid();
  if not found then
    raise exception 'Officer profile not found.';
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
  where m.sbu_id = v_officer.sbu_id;
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
    _start_date, _end_date, v_officer.name, v_officer.email,
    _marketing_expense_total, _extra_fields
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Officer sees only their own SBU's campaigns (submission history).
create or replace function public.officer_list_campaigns()
returns table (
  id bigint,
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
  v_sbu integer;
  v_bu bigint;
begin
  if not public.auth_is_officer() then
    raise exception 'forbidden';
  end if;
  select o.sbu_id into v_sbu from public.officer_profiles o where o.user_id = auth.uid();
  select m.business_unit_id into v_bu from public.sbu_romi_map m where m.sbu_id = v_sbu;
  return query
    select rc.id, rc.campaign_name, rc.category, rc.report_month,
           rc.start_date, rc.end_date, rc.marketing_expense_total, rc.created_at
    from public.romi_campaign rc
    where rc.business_unit_id = v_bu
    order by rc.created_at desc;
end;
$$;

-- ------------------------------------------------------------
-- 7. Expose extra_fields + officer identity through the read view.
-- ------------------------------------------------------------
drop view if exists public.v_romi_campaign;
create view public.v_romi_campaign
with (security_invoker = true) as
  select
    rc.id,
    rc.business_unit_id,
    m.sbu_id,
    sbu.code,
    sbu.name  as sbu_name,
    sbu.section,
    rc.campaign_name,
    rc.category,
    rc.report_month,
    rc.start_date,
    rc.end_date,
    rc.officer_name,
    rc.officer_enroll,
    rc.marketing_expense_total,
    rc.extra_fields,
    -- engine-computed base values
    rc.actual_rev,
    rc.organic_rev,
    rc.organic_rev_sply,
    rc.sply_rev,
    rc.gp_margin,
    rc.spend_pool_total,
    rc.n_months,
    rc.as_of,
    -- admin overrides
    rc.actual_rev_ov,
    rc.organic_rev_ov,
    rc.sply_rev_ov,
    rc.gp_margin_ov,
    rc.incr_rev_ov,
    rc.actual_profit_ov,
    rc.base_profit_ov,
    rc.sply_profit_ov,
    rc.incr_profit_ov,
    rc.romi_top_ov,
    rc.romi_bottom_ov,
    -- branch-mark benchmark (from romi_sbu)
    rs.benchmark_top,
    rs.benchmark_bottom,
    rs.benchmark_note
  from public.romi_campaign rc
  join public.sbu_romi_map m on m.business_unit_id = rc.business_unit_id
  join public.sbu sbu on sbu.id = m.sbu_id
  left join public.romi_sbu rs on rs.business_unit_id = rc.business_unit_id;
