-- ============================================================
-- Ops Flash Report — 00018_refresh_button.sql
-- Web-triggered refresh: an admin clicks "Refresh" in the web UI,
-- which writes a pending request here. A lightweight agent on the
-- office PC (DWH-accessible) polls this table and runs the ETL.
--
--   * admins can request a refresh (admin_request_refresh)
--   * admins can read the latest request status (admin_get_refresh_status)
--   * the office agent reads/writes via the direct Postgres connection
--     (bypasses RLS) using SUPABASE_DB_URL.
--
-- The table is RLS-enabled with NO policies, so it is not reachable
-- through PostgREST by anon/authenticated users — only via the two
-- SECURITY DEFINER RPCs (admin-gated) and the agent's direct connection.
-- ============================================================

create table if not exists public.refresh_requests (
  id           bigint generated always as identity primary key,
  status       text not null default 'pending',   -- pending|running|success|failed
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  report_date  date,
  run_id       uuid,
  error        text
);

create index if not exists idx_refresh_requests_status
  on public.refresh_requests (status, id);

alter table public.refresh_requests enable row level security;

-- Admin-only: enqueue a refresh. Throttled so there is at most one
-- in-flight (pending/running) request at a time.
create or replace function public.admin_request_refresh()
returns table (
  id bigint,
  status text,
  requested_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  report_date date,
  error text
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.auth_is_admin() then
    raise exception 'forbidden';
  end if;

  if exists (
    select 1 from public.refresh_requests rr
    where rr.status in ('pending', 'running')
  ) then
    raise exception 'A refresh is already pending or running.';
  end if;

  insert into public.refresh_requests as rr (requested_by, status)
  values (auth.uid(), 'pending')
  returning rr.id into v_id;

  return query
    select r.id, r.status, r.requested_at, r.started_at, r.finished_at,
           r.report_date, r.error
    from public.refresh_requests r
    where r.id = v_id;
end;
$$;

-- Admin-only: latest request row (for the button's live status).
create or replace function public.admin_get_refresh_status()
returns table (
  id bigint,
  status text,
  requested_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  report_date date,
  error text
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.auth_is_admin() then
    raise exception 'forbidden';
  end if;
  return query
    select r.id, r.status, r.requested_at, r.started_at, r.finished_at,
           r.report_date, r.error
    from public.refresh_requests r
    order by r.id desc
    limit 1;
end;
$$;
