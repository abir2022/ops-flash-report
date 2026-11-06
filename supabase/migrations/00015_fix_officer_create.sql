-- ============================================================
-- Ops Flash Report — 00015_fix_officer_create.sql
-- Fix "Failed to create officer" (HTTP 409).
--
-- Root cause #1: `on conflict (user_id)` inside admin_create_officer
-- is ambiguous — the function returns a table whose OUT column is
-- named `user_id`, so Postgres can't tell whether the conflict target
-- refers to that OUT variable or to public.profiles.user_id. This
-- raised SQLSTATE 42702 on every officer creation.
--
-- Root cause #2: the duplicate-email guard only checked
-- officer_profiles, not auth.users. Creating an officer whose email
-- already existed as any auth user surfaced as an opaque 409
-- (unique_violation on auth.users.email). We now pre-check and raise
-- a clear message instead.
--
-- Both are fixed here by re-defining admin_create_officer. Idempotent.
-- ============================================================

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
  if exists (select 1 from auth.users u where u.email = _email and u.is_sso_user = false) then
    raise exception 'This email is already registered as a user.';
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

  -- Unambiguous conflict target: reference the PK constraint by name
  -- instead of the column, so the OUT column `user_id` no longer shadows it.
  insert into public.profiles (user_id, role, display_name)
  values (v_user, 'officer', _name)
  on conflict on constraint profiles_pkey
  do update set role = 'officer', display_name = excluded.display_name;

  insert into public.officer_profiles (user_id, name, email, phone, sbu_id, created_by)
  values (v_user, _name, _email, _phone, _sbu_id, auth.uid());

  return query select v_user, _name, _email, _sbu_id;
end;
$$;
