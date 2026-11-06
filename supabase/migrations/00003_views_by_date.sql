-- ============================================================
-- Ops Flash Report — 00003_views_by_date.sql
-- Make the read views date-aware (return every snapshot date) so the
-- frontend can show any historical report date, not just the latest.
-- ============================================================

-- Scorecard rows for ANY date, joined to SBU
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
  join public.sbu sbu on sbu.id = s.sbu_id;

-- Portfolio KPI aggregates, one row per report date
create or replace view public.v_kpi
with (security_invoker = true) as
  select
    report_date,
    coalesce(sum(daily_rev), 0)    as total_daily,
    coalesce(sum(mtd_rev), 0)      as total_mtd,
    coalesce(sum(fy_ytd_rev), 0)   as total_fy_ytd,
    coalesce(sum(cy_ytd_rev), 0)   as total_cy_ytd,
    count(*) filter (where mtd_rev > 0)            as active_sbus,
    count(*) filter (where mtd_ach_pct is not null) as sbus_with_target,
    round(avg(mtd_ach_pct) filter (where mtd_ach_pct is not null), 2) as avg_ach_pct
  from public.daily_snapshot
  group by report_date;

-- Reconciliation for any date (no latest-date filter)
create or replace view public.v_reconciliation
with (security_invoker = true) as
  select *
  from public.reconciliation;

-- All distinct report dates (desc) — feeds the frontend date picker
create or replace view public.v_report_dates
with (security_invoker = true) as
  select distinct report_date
  from public.daily_snapshot
  order by report_date desc;
