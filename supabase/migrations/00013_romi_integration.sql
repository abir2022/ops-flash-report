-- ============================================================
-- Ops Flash Report — 00013_romi_integration.sql
-- Integrate the "Automated ROMI for all SBU" project (which already
-- shares this Supabase project) into the Marketing tab as two layers:
--   * Marketing Led Overview   (existing spend-efficiency content)
--   * ROMI Analysis            (campaign ledger + branch-mark benchmark)
--
-- The ROMI project's tables (romi_sbu, romi_campaign) already exist here
-- but have RLS enabled with NO policies. This migration:
--   1. sbu_romi_map — bridges the ROMI DWH id space (intSBUId) to the
--      flash-report id space (intBusinessAreaId / public.sbu.id).
--   2. admin-only select policies on romi_sbu / romi_campaign.
--   3. v_romi_campaign / v_romi_sbu read views (security_invoker).
--   4. Survey tables — an admin-controlled campaign survey whose
--      submissions feed romi_campaign.
--
-- NOTE: romi_* tables live in the public schema (same database) — verified
-- via to_regclass('romi_sbu') = 'romi_sbu'.
-- ============================================================

-- ------------------------------------------------------------
-- 1. SBU bridge — romi business_unit_id (intSBUId) <-> flash sbu.id
--    (intBusinessAreaId). Code join is the natural key, with explicit
--    overrides for the few codes that differ between the two systems.
-- ------------------------------------------------------------
create table if not exists public.sbu_romi_map (
  sbu_id            integer not null references public.sbu(id) on delete cascade,
  business_unit_id  bigint  not null,
  code              text    not null,
  created_at        timestamptz not null default now(),
  primary key (sbu_id),
  unique (business_unit_id)
);

create index if not exists idx_sbu_romi_map_bu
  on public.sbu_romi_map (business_unit_id);

alter table public.sbu_romi_map enable row level security;

create policy "sbu_romi_map_select" on public.sbu_romi_map
  for select to authenticated
  using (public.auth_is_admin());

-- Seed the 32 report-scope SBUs. 28 match by code; 4 need explicit
-- overrides (different code string, same legal entity):
--   NXCL1(72)  -> BTL(178)    Bengal Traders Ltd
--   NXCL2(77)  -> DyTCL(182)  Deltas Trading Company Ltd
--   NXEN(123)  -> AENL(246)   NexaGroup Engineering Ltd.
--   NXOR(126)     -> ACEL(249)   NEXAGROUP Consumer Electronics Limited
insert into public.sbu_romi_map (sbu_id, business_unit_id, code) values
  ( 19,   8, 'NXPL'),
  ( 36, 144, 'NXES'),
  ( 58,   4, 'NXCM'),
  ( 64,  17, 'NXSL'),
  ( 69, 175, 'NXRM'),
  ( 72, 178, 'NXCL1'),      -- override: BTL
  ( 77, 182, 'NXCL2'),      -- override: DyTCL
  ( 79,  12, 'NXOC'),
  ( 80, 102, 'NXSL1'),
  ( 81, 117, 'NXMT'),
  ( 82, 184, 'NXBO'),
  ( 83, 186, 'NXBP'),
  ( 84, 138, 'NXIT'),
  ( 86, 188, 'NXHM'),
  ( 87, 189, 'NXFL'),
  ( 88, 208, 'NXSE'),
  ( 91, 211, 'NXNT'),
  ( 98, 220, 'NXAB'),
  ( 99, 221, 'NXAL'),
  (102, 224, 'NXST'),
  (109, 232, 'NXAF'),
  (110, 233, 'NXSC'),
  (114, 237, 'NXLE'),
  (115, 238, 'NXAI'),
  (118, 241, 'NXAT'),
  (120, 243, 'NXEF'),
  (123, 246, 'NXEN'),       -- override: AENL
  (124, 247, 'NXBL'),
  (126, 249, 'NXOR'),          -- override: ACEL
  (128, 251, 'NXMX'),
  (129, 252, 'NXNJ'),
  (132, 255, 'NXMP')
on conflict (sbu_id) do update
  set business_unit_id = excluded.business_unit_id,
      code = excluded.code;

-- ------------------------------------------------------------
-- 2. Admin-only read access on the ROMI project's tables.
-- ------------------------------------------------------------
drop policy if exists "romi_sbu_select" on public.romi_sbu;
create policy "romi_sbu_select" on public.romi_sbu
  for select to authenticated
  using (public.auth_is_admin());

drop policy if exists "romi_campaign_select" on public.romi_campaign;
create policy "romi_campaign_select" on public.romi_campaign
  for select to authenticated
  using (public.auth_is_admin());

-- ------------------------------------------------------------
-- 3. Read views (security_invoker so the RLS above applies).
--    v_romi_campaign joins campaigns to the flash sbu dimension via
--    sbu_romi_map, and carries the branch-mark benchmark from romi_sbu.
--    The effective-value logic (COALESCE(override, computed)) stays in
--    the client (lib/romi.ts) to keep it unit-testable — mirroring the
--    ROMI project's romi_logic.py.
-- ------------------------------------------------------------
create or replace view public.v_romi_campaign
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
    rs.benchmark_bottom
  from public.romi_campaign rc
  join public.sbu_romi_map m on m.business_unit_id = rc.business_unit_id
  join public.sbu sbu on sbu.id = m.sbu_id
  left join public.romi_sbu rs on rs.business_unit_id = rc.business_unit_id;

create or replace view public.v_romi_sbu
with (security_invoker = true) as
  select
    rs.business_unit_id,
    rs.code,
    rs.name,
    rs.gp_margin,
    rs.benchmark_top,
    rs.benchmark_bottom,
    rs.is_active,
    m.sbu_id
  from public.romi_sbu rs
  left join public.sbu_romi_map m on m.business_unit_id = rs.business_unit_id;

-- ------------------------------------------------------------
-- 4. Survey system — admin-controlled form + officer submissions.
--    Admin defines the form (any questions, stored as a JSONB field
--    list); submissions record the officer + responses and are promoted
--    into romi_campaign rows on approval.
-- ------------------------------------------------------------
create table if not exists public.romi_survey_form (
  id           bigint generated always as identity primary key,
  title        text not null,
  description  text,
  fields       jsonb not null default '[]'::jsonb,  -- [{key,label,type,required,options}]
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.romi_survey_submission (
  id                 bigint generated always as identity primary key,
  form_id            bigint not null references public.romi_survey_form(id) on delete cascade,
  business_unit_id   bigint,                    -- romi SBU the officer selected
  officer_name       text,
  officer_enroll     text,
  responses          jsonb not null default '{}'::jsonb,
  status             text not null default 'submitted',  -- submitted/approved/rejected
  campaign_id        bigint,                    -- set once promoted to romi_campaign
  created_at         timestamptz not null default now(),
  reviewed_at        timestamptz
);

create index if not exists idx_romi_survey_submission_form
  on public.romi_survey_submission (form_id);
create index if not exists idx_romi_survey_submission_status
  on public.romi_survey_submission (status);

alter table public.romi_survey_form enable row level security;
alter table public.romi_survey_submission enable row level security;

-- Form definition and submissions are admin-only (survey is controlled
-- by the admin; officers submit through the admin-entered flow).
create policy "romi_survey_form_select" on public.romi_survey_form
  for select to authenticated
  using (public.auth_is_admin());

create policy "romi_survey_submission_select" on public.romi_survey_submission
  for select to authenticated
  using (public.auth_is_admin());
