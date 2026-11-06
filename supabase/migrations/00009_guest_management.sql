-- ============================================================
-- Ops Flash Report — 00009_guest_management.sql
-- Admin-only SECURITY DEFINER functions for the full guest lifecycle,
-- implemented in Postgres (pgcrypto) so no Edge Function / service-role
-- deploy is required. Guest auth users are real auth.users rows with a
-- bcrypt passcode; access is still gated by guest_grants + RLS (00008).
--
-- These run as the function owner (postgres), so they can write auth.users
-- and auth.identities. Every entry point checks auth_is_admin() first.
-- ============================================================

-- ------------------------------------------------------------
-- Random passcode helper (unambiguous alphanumerics).
-- ------------------------------------------------------------
create or replace function public.gen_passcode(len int default 10)
returns text
language sql volatile
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                           (floor(random() * 32))::int + 1, 1), '')
  from generate_series(1, len);
$$;

-- ------------------------------------------------------------
-- admin_create_guest(username, allowed_sbus, expires_at [, passcode])
-- Creates the auth user + identity + profile + grant, returns the
-- one-time credentials (passcode shown once).
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

  insert into public.guest_grants (user_id, username, link_token, allowed_sbus, expires_at, status, created_by)
  values (v_user, _username, v_token, _allowed_sbus, _expires_at, 'active', auth.uid());

  return query
    select _username, v_passcode, v_email, v_token, _expires_at, _allowed_sbus;
end;
$$;

-- ------------------------------------------------------------
-- admin_list_grants() -> grant rows for the admin panel.
-- ------------------------------------------------------------
create or replace function public.admin_list_grants()
returns table (
  id uuid,
  username text,
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
    select g.id, g.username, g.allowed_sbus, g.expires_at, g.status,
           g.first_login_at, g.used_at, g.created_at
    from public.guest_grants g
    order by g.created_at desc;
end;
$$;

-- ------------------------------------------------------------
-- admin_revoke_guest(grant_id) -> deletes the auth user + identity,
-- keeps the grant row (status = 'revoked') for the audit trail.
-- ------------------------------------------------------------
create or replace function public.admin_revoke_guest(_grant_id uuid)
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
  -- Detach first so the audit row survives the auth.users cascade delete.
  update public.guest_grants g set user_id = null, status = 'revoked' where g.id = _grant_id;

  if v_user is not null then
    delete from auth.identities where user_id = v_user;
    delete from auth.users where id = v_user;   -- cascades public.profiles
  end if;
end;
$$;
