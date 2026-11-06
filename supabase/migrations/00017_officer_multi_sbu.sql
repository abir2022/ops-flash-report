-- ============================================================
-- Ops Flash Report — 00017_officer_multi_sbu.sql
-- Redesign the officer survey to a login-based, multi-SBU model:
--
--   * An officer is tagged to ONE OR MANY SBUs (officer_profiles.sbu_id
--     integer -> sbu_ids integer[]).
--   * Admin creates an officer with multiple responsible SBUs.
--   * The officer logs in and the survey form auto-detects their SBUs
--     from the profile — no per-SBU token link needed.
--   * officer_submit_campaign now takes an explicit _sbu_id (the officer
--     picks which of their SBUs the campaign belongs to).
--   * The no-login, per-SBU "survey link" (00016) is dropped: its token
--     table and public_* RPCs are superseded by officer login.
-- ============================================================

-- ------------------------------------------------------------
-- 1. officer_profiles: single sbu_id -> sbu_ids int[].
-- ------------------------------------------------------------
alter table public.officer_profiles
  add column if not exists sbu_ids integer[] not null default '{}';

-- Backfill from the old single sbu_id column (only when it still exists).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'officer_profiles'
      and column_name = 'sbu_id'
  ) then
    update public.officer_profiles
      set sbu_ids = array[sbu_id]
      where sbu_ids = '{}' and sbu_id is not null;
    drop index if exists idx_officer_profiles_sbu;
    alter table public.officer_profiles drop column sbu_id;
  end if;
end;
$$;

create index if not exists idx_officer_profiles_sbu_ids
  on public.officer_profiles using gin (sbu_ids);

-- ------------------------------------------------------------
-- 2. Drop the now-superseded RPCs (per-SBU survey link + old
--    single-SBU officer signatures).
-- ------------------------------------------------------------
drop function if exists public.admin_create_survey_link(integer, text);
drop function if exists public.admin_list_survey_links();
drop function if exists public.admin_revoke_survey_link(bigint);
drop function if exists public.public_get_survey(text);
drop function if exists public.public_submit_survey(text, text, text, jsonb);
drop table if exists public.romi_survey_link;

drop function if exists public.admin_create_officer(text, text, text, integer, text);
drop function if exists public.admin_list_officers();
drop function if exists public.officer_profile();
drop function if exists public.officer_submit_campaign(text, text, date, date, double precision, jsonb);
drop function if exists public.officer_list_campaigns();

-- ------------------------------------------------------------
-- 3. Admin RPCs — officer lifecycle (multi-SBU).
-- ------------------------------------------------------------
create or replace function public.admin_create_officer(
  _name text,
  _email text,
  _phone text,
  _sbu_ids integer[],
  _password text
)
returns table (user_id uuid, name text, email text, sbu_ids integer[])
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_user uuid;
  v_bad integer;
begin
  if not public.auth_is_admin() then
    raise exception 'forbidden';
  end if;

  _name  := btrim(_name);
  _email := lower(btrim(_email));
  _phone := btrim(coalesce(_phone, ''));
  _sbu_ids := coalesce(_sbu_ids, '{}'::integer[]);

  if length(_name) < 2 then
    raise exception 'Name is required.';
  end if;
  if _email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email is required.';
  end if;
  if coalesce(_password, '') = '' or length(_password) < 8 then
    raise exception 'Password must be at least 8 characters.';
  end if;
  if coalesce(array_length(_sbu_ids, 1), 0) = 0 then
    raise exception 'Select at least one SBU.';
  end if;
  if exists (select 1 from public.officer_profiles o where lower(o.email) = _email) then
    raise exception 'An officer with this email already exists.';
  end if;
  if exists (select 1 from auth.users u where u.email = _email and u.is_sso_user = false) then
    raise exception 'This email is already registered as a user.';
  end if;

  select count(*) into v_bad
  from unnest(_sbu_ids) x(id)
  where not exists (select 1 from public.sbu s where s.id = x.id);
  if v_bad > 0 then
    raise exception 'One or more SBUs do not exist.';
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
  on conflict on constraint profiles_pkey
  do update set role = 'officer', display_name = excluded.display_name;

  insert into public.officer_profiles (user_id, name, email, phone, sbu_ids, created_by)
  values (v_user, _name, _email, _phone, _sbu_ids, auth.uid());

  return query select v_user, _name, _email, _sbu_ids;
end;
$$;

create or replace function public.admin_list_officers()
returns table (
  user_id uuid,
  name text,
  email text,
  phone text,
  sbu_ids integer[],
  sbu_codes text[],
  sbu_names text[],
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
    select o.user_id, o.name, o.email, o.phone,
           o.sbu_ids,
           coalesce((select array_agg(s.code order by s.id) from public.sbu s where s.id = any(o.sbu_ids)), '{}'::text[]) as sbu_codes,
           coalesce((select array_agg(s.name order by s.id) from public.sbu s where s.id = any(o.sbu_ids)), '{}'::text[]) as sbu_names,
           o.is_active, o.created_at
    from public.officer_profiles o
    order by o.created_at desc;
end;
$$;

-- ------------------------------------------------------------
-- 4. Officer RPCs — self-service campaign entry (multi-SBU).
-- ------------------------------------------------------------
create or replace function public.officer_profile()
returns table (
  name text,
  email text,
  phone text,
  sbu_ids integer[],
  sbu_codes text[],
  sbu_names text[]
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.auth_is_officer() then
    raise exception 'forbidden';
  end if;
  return query
    select o.name, o.email, o.phone,
           o.sbu_ids,
           coalesce((select array_agg(s.code order by s.id) from public.sbu s where s.id = any(o.sbu_ids)), '{}'::text[]) as sbu_codes,
           coalesce((select array_agg(s.name order by s.id) from public.sbu s where s.id = any(o.sbu_ids)), '{}'::text[]) as sbu_names
    from public.officer_profiles o
    where o.user_id = auth.uid();
end;
$$;

-- Officer submits a campaign for one of their responsible SBUs. The officer
-- passes _sbu_id (they may be tagged to many); name / enroll come from the
-- profile; business_unit_id resolves via sbu_romi_map; report_month follows
-- the end date.
create or replace function public.officer_submit_campaign(
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

  if not (_sbu_id = any(v_officer.sbu_ids)) then
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
    _start_date, _end_date, v_officer.name, v_officer.email,
    _marketing_expense_total, _extra_fields
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Officer sees campaigns across all their responsible SBUs.
create or replace function public.officer_list_campaigns()
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
  if not public.auth_is_officer() then
    raise exception 'forbidden';
  end if;
  select o.sbu_ids into v_sbu_ids from public.officer_profiles o where o.user_id = auth.uid();

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
