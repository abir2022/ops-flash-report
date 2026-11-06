-- ============================================================
-- Ops Flash Report — 00002_rls.sql
-- Row Level Security + read views for the frontend.
-- Write access is service-role only (no write policies = default deny
-- for anon/authenticated; service role bypasses RLS entirely).
-- ============================================================

-- ---------- RLS: enable on all tables ----------
alter table public.sbu             enable row level security;
alter table public.target          enable row level security;
alter table public.daily_snapshot  enable row level security;
alter table public.daily_trend     enable row level security;
alter table public.reconciliation  enable row level security;
alter table public.refresh_run     enable row level security;
alter table public.override        enable row level security;

-- ---------- Read policies: authenticated only ----------
create policy "sbu_select" on public.sbu
  for select to authenticated using (true);

create policy "target_select" on public.target
  for select to authenticated using (true);

create policy "snapshot_select" on public.daily_snapshot
  for select to authenticated using (true);

create policy "trend_select" on public.daily_trend
  for select to authenticated using (true);

create policy "recon_select" on public.reconciliation
  for select to authenticated using (true);

create policy "refresh_run_select" on public.refresh_run
  for select to authenticated using (true);

create policy "override_select" on public.override
  for select to authenticated using (true);

-- ============================================================
-- Read views (security_invoker so RLS of base tables applies)
-- ============================================================

-- Latest report date present in the snapshot table
create or replace view public.v_latest_date
with (security_invoker = true) as
  select max(report_date) as report_date from public.daily_snapshot;

-- Scorecard rows for the latest date, joined to SBU + target
create or replace view public.v_scorecard
with (security_invoker = true) as
  select
    s.sbu_id,
    sbu.code,
    sbu.name,
    sbu.is_freight,
    s.channel,
    s.src,
    s.daily_rev, s.dod_rev, s.mtd_rev, s.mom_rev, s.yoy_rev,
    s.fy_ytd_rev, s.cy_ytd_rev,
    s.daily_vol, s.dod_vol, s.mtd_vol, s.mom_vol, s.vol_uom, s.has_vol,
    s.mo_tgt_rev, s.mtd_tgt_rev, s.mo_tgt_vol, s.mtd_tgt_vol, s.mtd_ach_pct,
    s.mom_pct, s.yoy_pct, s.proj_rev, s.momentum,
    s.report_date
  from public.daily_snapshot s
  join public.sbu sbu on sbu.id = s.sbu_id
  where s.report_date = (select report_date from public.v_latest_date);

-- Portfolio KPI aggregates for the latest date
create or replace view public.v_kpi
with (security_invoker = true) as
  select
    (select report_date from public.v_latest_date) as report_date,
    coalesce(sum(daily_rev), 0)    as total_daily,
    coalesce(sum(mtd_rev), 0)      as total_mtd,
    coalesce(sum(fy_ytd_rev), 0)   as total_fy_ytd,
    coalesce(sum(cy_ytd_rev), 0)   as total_cy_ytd,
    count(*) filter (where mtd_rev > 0)            as active_sbus,
    count(*) filter (where mtd_ach_pct is not null) as sbus_with_target,
    round(avg(mtd_ach_pct) filter (where mtd_ach_pct is not null), 2) as avg_ach_pct
  from public.daily_snapshot
  where report_date = (select report_date from public.v_latest_date);

-- Freshness: most recent pipeline run + DWH sync watermark
create or replace view public.v_freshness
with (security_invoker = true) as
  select id, started_at, finished_at, status, report_date,
         dwh_latest_post, dwh_synced_at, error, meta
  from public.refresh_run
  order by started_at desc
  limit 1;

-- Reconciliation for the latest date
create or replace view public.v_reconciliation
with (security_invoker = true) as
  select *
  from public.reconciliation
  where report_date = (select report_date from public.v_latest_date);

-- Portfolio daily total revenue (across all SBUs) for the trend chart
create or replace view public.v_portfolio_trend
with (security_invoker = true) as
  select d as day, sum(value) as total
  from public.daily_trend
  group by d
  order by d;
