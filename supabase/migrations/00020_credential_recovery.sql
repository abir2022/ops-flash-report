-- ============================================================
-- Ops Flash Report — 00020_credential_recovery.sql
-- Let the admin recover / manage guest & officer credentials from
-- the Admin Panel: view (reveal) email + password + login URL, reset
-- a lost password/passcode, revoke, reactivate, and hard-delete.
--
-- Passwords are bcrypt-hashed in auth.users (one-way), so to support
-- "reveal" this migration stores a plaintext copy of each credential
-- (guest_grants.passcode, officer_profiles.password_plain) at creation
-- and every reset. These columns are only ever read by admin-only
-- SECURITY DEFINER RPCs.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Plaintext credential columns (nullable — legacy rows have no
--    recoverable credential until the admin resets them).
-- ------------------------------------------------------------
alter table public.guest_grants
  add column if not exists passcode text;

alter table public.officer_profiles
  add column if not exists password_plain text;

-- ------------------------------------------------------------
-- 2. admin_create_guest — also persist the plaintext passcode.
-- ------------------------------------------------------------
create or replace function public.admin_create_guest(
  _username text,
  _allowed_sbus integer[],
  _expires_at timestamptz,
  _passcode text default null
)
returns table (
  username text,
  passcode text,
  email text,
  link_token text,
  expires_at timestamptz,
  allowed_sbus integer[]
)
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_passcode text;
  v_email text;
  v_user uuid;
  v_token text;
begin
  if not public.auth_is_admin() then
    raise exception 'forbidden';
  end if;

  _username := lower(btrim(_username));
  if _username !~ '^[a-z0-9._-]{3,32}$' then
    raise exception 'Username must be 3-32 chars (a-z, 0-9, . _ -).';
  end if;
  if coalesce(array_length(_allowed_sbus, 1), 0) = 0 then
    raise exception 'Select at least one SBU.';
  end if;
  if _expires_at is null or _expires_at <= now() then
    raise exception 'Expiry must be in the future.';
  end if;

  v_passcode := coalesce(_passcode, public.gen_passcode());
  v_email := _username || '@guest.opsflash.app';
  v_user := gen_random_uuid();
  v_token := gen_random_uuid()::text;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user, 'authenticated', 'authenticated', v_email,
    crypt(v_passcode, gen_salt('bf', 10)),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('role', 'guest', 'username', _username),
    now(), now(),
    '', '', '', '', false, false
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at, id
  ) values (
    v_user, v_user,
    jsonb_build_object('sub', v_user, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now(), gen_random_uuid()
  );

  insert into public.profiles (user_id, role, display_name)
  values (v_user, 'guest', _username)
  on conflict (user_id) do update set role = 'guest', display_name = excluded.display_name;

  insert into public.guest_grants (user_id, username, link_token, passcode, allowed_sbus, expires_at, status, created_by)
  values (v_user, _username, v_token, v_passcode, _allowed_sbus, _expires_at, 'active', auth.uid());

  return query
    select _username, v_passcode, v_email, v_token, _expires_at, _allowed_sbus;
end;
$$;

-- ------------------------------------------------------------
-- 3. admin_create_officer — also persist the plaintext password.
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

  insert into public.officer_profiles (user_id, name, email, phone, sbu_ids, password_plain, created_by)
  values (v_user, _name, _email, _phone, _sbu_ids, _password, auth.uid());

  return query select v_user, _name, _email, _sbu_ids;
end;
$$;

-- ------------------------------------------------------------
-- 4. admin_list_grants — expose email, passcode and link token.
-- ------------------------------------------------------------
drop function if exists public.admin_list_grants();
create or replace function public.admin_list_grants()
returns table (
  id uuid,
  username text,
  email text,
  passcode text,
  link_token text,
  allowed_sbus integer[],
  expires_at timestamptz,
  status text,
  first_login_at timestamptz,
  used_at timestamptz,
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
    select g.id, g.username, g.username || '@guest.opsflash.app', g.passcode, g.link_token,
           g.allowed_sbus, g.expires_at, g.status,
           g.first_login_at, g.used_at, g.created_at
    from public.guest_grants g
    order by g.created_at desc;
end;
$$;

-- ------------------------------------------------------------
-- 5. admin_list_officers — expose the plaintext password.
-- ------------------------------------------------------------
drop function if exists public.admin_list_officers();
create or replace function public.admin_list_officers()
returns table (
  user_id uuid,
  name text,
  email text,
  phone text,
  password text,
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
    select o.user_id, o.name, o.email, o.phone, o.password_plain,
           o.sbu_ids,
           coalesce((select array_agg(s.code order by s.id) from public.sbu s where s.id = any(o.sbu_ids)), '{}'::text[]) as sbu_codes,
           coalesce((select array_agg(s.name order by s.id) from public.sbu s where s.id = any(o.sbu_ids)), '{}'::text[]) as sbu_names,
           o.is_active, o.created_at
    from public.officer_profiles o
    order by o.created_at desc;
end;
$$;

-- ------------------------------------------------------------
-- 6. admin_reset_guest — issue a fresh passcode + link token and
--    reactivate the grant (covers "reset" and "reactivate": used,
--    expired and revoked grants alike, recreating the auth user if it
--    was deleted). Extends an expired grant by 3 days.
-- ------------------------------------------------------------
create or replace function public.admin_reset_guest(
  _grant_id uuid,
  _expires_at timestamptz default null
)
returns table (
  username text,
  passcode text,
  email text,
  link_token text,
  expires_at timestamptz,
  allowed_sbus integer[]
)
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_username text;
  v_passcode text;
  v_token text;
  v_user uuid;
  v_expires timestamptz;
  v_allowed integer[];
begin
  if not public.auth_is_admin() then
    raise exception 'forbidden';
  end if;

  select g.username, g.allowed_sbus, g.expires_at, g.user_id
    into v_username, v_allowed, v_expires, v_user
  from public.guest_grants g
  where g.id = _grant_id;
  if not found then
    raise exception 'Guest grant not found.';
  end if;

  v_passcode := public.gen_passcode();
  v_token := gen_random_uuid()::text;
  v_expires := coalesce(_expires_at, v_expires);
  if v_expires is null or v_expires <= now() then
    v_expires := now() + interval '3 days';
  end if;

  if v_user is null or not exists (select 1 from auth.users u where u.id = v_user) then
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
      v_user, 'authenticated', 'authenticated', v_username || '@guest.opsflash.app',
      crypt(v_passcode, gen_salt('bf', 10)),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('role', 'guest', 'username', v_username),
      now(), now(),
      '', '', '', '', false, false
    );
    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at, id
    ) values (
      v_user, v_user,
      jsonb_build_object('sub', v_user, 'email', v_username || '@guest.opsflash.app', 'email_verified', true),
      'email', now(), now(), now(), gen_random_uuid()
    );
    insert into public.profiles (user_id, role, display_name)
    values (v_user, 'guest', v_username)
    on conflict (user_id) do update set role = 'guest', display_name = excluded.display_name;
  else
    update auth.users u
       set encrypted_password = crypt(v_passcode, gen_salt('bf', 10)), updated_at = now()
     where u.id = v_user;
  end if;

  update public.guest_grants g
     set passcode = v_passcode, link_token = v_token, user_id = v_user,
         status = 'active', used_at = null, first_login_at = null, expires_at = v_expires
   where g.id = _grant_id;

  return query
    select v_username, v_passcode, v_username || '@guest.opsflash.app', v_token, v_expires, v_allowed;
end;
$$;

-- ------------------------------------------------------------
-- 7. admin_reset_officer_password — set a new password (or generate
--    one) and persist both the hash and the plaintext copy.
-- ------------------------------------------------------------
create or replace function public.admin_reset_officer_password(
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

  select o.email into v_email from public.officer_profiles o where o.user_id = _user_id;
  if not found then
    raise exception 'Officer not found.';
  end if;

  v_password := coalesce(nullif(_password, ''), public.gen_passcode(10));
  if length(v_password) < 8 then
    raise exception 'Password must be at least 8 characters.';
  end if;

  update auth.users u
     set encrypted_password = crypt(v_password, gen_salt('bf', 10)), updated_at = now()
   where u.id = _user_id;
  update public.officer_profiles o
     set password_plain = v_password
   where o.user_id = _user_id;

  return query select v_email, v_password;
end;
$$;

-- ------------------------------------------------------------
-- 8. Hard delete (removes the auth user + identities + profile +
--    grant/officer row entirely; no audit row is kept).
-- ------------------------------------------------------------
create or replace function public.admin_delete_guest(_grant_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'forbidden';
  end if;
  select g.user_id into v_user from public.guest_grants g where g.id = _grant_id;
  delete from public.guest_grants g where g.id = _grant_id;
  if v_user is not null then
    delete from auth.users u where u.id = v_user;
  end if;
end;
$$;

create or replace function public.admin_delete_officer(_user_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.auth_is_admin() then
    raise exception 'forbidden';
  end if;
  delete from public.officer_profiles o where o.user_id = _user_id;
  delete from auth.users u where u.id = _user_id;
end;
$$;
