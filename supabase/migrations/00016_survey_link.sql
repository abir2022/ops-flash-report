-- ============================================================
-- Ops Flash Report — 00016_survey_link.sql
-- Public "survey link" for marketing officers: a no-login, Google-Form
-- style link the admin issues for a specific SBU. An officer opens the
-- link, enters their name + enroll, adds one or more campaigns, and
-- submits — rows land directly in romi_campaign (no officer account
-- needed). Mirrors the "Automated ROMI for all SBU" officer portal.
--
--   * romi_survey_link   — one shareable link per SBU (token-gated).
--   * admin_create_survey_link / admin_list_survey_links /
--     admin_revoke_survey_link  (admin-only lifecycle).
--   * public_get_survey / public_submit_survey  (SECURITY DEFINER,
--     callable by anon + authenticated; the token is the credential).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Survey link table.
-- ------------------------------------------------------------
create table if not exists public.romi_survey_link (
  id           bigint generated always as identity primary key,
  token        text not null unique,
  sbu_id       integer not null references public.sbu(id) on delete cascade,
  title        text,
  is_active    boolean not null default true,
  created_by   uuid,
  created_at   timestamptz not null default now()
);

create index if not exists idx_romi_survey_link_token
  on public.romi_survey_link (token);

alter table public.romi_survey_link enable row level security;

drop policy if exists "romi_survey_link_admin_select" on public.romi_survey_link;
create policy "romi_survey_link_admin_select" on public.romi_survey_link
  for select to authenticated
  using (public.auth_is_admin());

-- ------------------------------------------------------------
-- 2. Admin lifecycle RPCs.
-- ------------------------------------------------------------
create or replace function public.admin_create_survey_link(
  _sbu_id integer,
  _title text default null
)
returns table (
  id bigint,
  token text,
  sbu_id integer,
  sbu_code text,
  sbu_name text,
  title text,
  is_active boolean,
  created_at timestamptz
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_token text;
  v_id bigint;
begin
  if not public.auth_is_admin() then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.sbu s where s.id = _sbu_id) then
    raise exception 'Unknown SBU.';
  end if;

  v_token := public.gen_passcode(16);
  insert into public.romi_survey_link (token, sbu_id, title, created_by)
  values (v_token, _sbu_id, btrim(coalesce(_title, '')), auth.uid())
  returning romi_survey_link.id into v_id;

  return query
    select l.id, l.token, l.sbu_id, s.code, s.name, l.title, l.is_active, l.created_at
    from public.romi_survey_link l
    join public.sbu s on s.id = l.sbu_id
    where l.id = v_id;
end;
$$;

create or replace function public.admin_list_survey_links()
returns table (
  id bigint,
  token text,
  sbu_id integer,
  sbu_code text,
  sbu_name text,
  title text,
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
    select l.id, l.token, l.sbu_id, s.code, s.name, l.title, l.is_active, l.created_at
    from public.romi_survey_link l
    join public.sbu s on s.id = l.sbu_id
    order by l.created_at desc;
end;
$$;

create or replace function public.admin_revoke_survey_link(_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.auth_is_admin() then
    raise exception 'forbidden';
  end if;
  update public.romi_survey_link set is_active = false where id = _id;
end;
$$;

-- ------------------------------------------------------------
-- 3. Public (token-gated) RPCs — the token is the credential, so
--    anon + authenticated may both call them.
-- ------------------------------------------------------------
create or replace function public.public_get_survey(_token text)
returns table (
  sbu_id integer,
  sbu_code text,
  sbu_name text,
  title text,
  is_active boolean
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  return query
    select l.sbu_id, s.code, s.name, l.title, l.is_active
    from public.romi_survey_link l
    join public.sbu s on s.id = l.sbu_id
    where l.token = _token;
end;
$$;

-- Submit one or more campaigns through a survey link. Campaigns arrive
-- as a JSONB array: [{campaign_name, category, start_date, end_date,
-- marketing_expense_total}]. report_month follows the end date (same
-- convention as officer_submit_campaign). Returns the number inserted.
create or replace function public.public_submit_survey(
  _token text,
  _officer_name text,
  _officer_enroll text,
  _campaigns jsonb
)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_link public.romi_survey_link%rowtype;
  v_bu bigint;
  v_campaign jsonb;
  v_count integer := 0;
  v_name text;
  v_category text;
  v_start date;
  v_end date;
  v_expense double precision;
begin
  select * into v_link from public.romi_survey_link l where l.token = _token;
  if not found then
    raise exception 'Invalid survey link.';
  end if;
  if not v_link.is_active then
    raise exception 'This survey link has been deactivated.';
  end if;

  if coalesce(btrim(_officer_name), '') = '' then
    raise exception 'Your name is required.';
  end if;

  select m.business_unit_id into v_bu
  from public.sbu_romi_map m
  where m.sbu_id = v_link.sbu_id;
  if v_bu is null then
    raise exception 'This SBU is not mapped to a ROMI business unit yet.';
  end if;

  for v_campaign in select * from jsonb_array_elements(coalesce(_campaigns, '[]'::jsonb))
  loop
    v_name := btrim(coalesce(v_campaign->>'campaign_name', ''));
    if v_name = '' then
      continue;
    end if;

    v_category := btrim(coalesce(v_campaign->>'category', 'Other'));
    if v_category = '' then
      v_category := 'Other';
    end if;

    v_start := nullif(v_campaign->>'start_date', '')::date;
    v_end := nullif(v_campaign->>'end_date', '')::date;
    if v_start is null or v_end is null or v_end < v_start then
      continue;
    end if;

    v_expense := coalesce((v_campaign->>'marketing_expense_total')::double precision, 0);
    if v_expense < 0 then
      v_expense := 0;
    end if;

    insert into public.romi_campaign (
      business_unit_id, campaign_name, category, report_month,
      start_date, end_date, officer_name, officer_enroll,
      marketing_expense_total
    ) values (
      v_bu, v_name, v_category, to_char(v_end, 'YYYY-MM'),
      v_start, v_end, btrim(_officer_name),
      btrim(coalesce(_officer_enroll, '')),
      v_expense
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.public_get_survey(text) to anon, authenticated;
grant execute on function public.public_submit_survey(text, text, text, jsonb) to anon, authenticated;
