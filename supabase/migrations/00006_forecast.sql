-- ============================================================
-- Ops Flash Report — 00006_forecast.sql
-- SBU-level monthly targets (summed across channels) for the
-- "Seasonal pattern -> forecast" section of Advanced Analysis.
-- NXAB (98) stores asphalt/lubex channels; summing gives one
-- whole-SBU monthly target, matching how the forecast works.
-- ============================================================

create or replace view public.v_sbu_monthly_targets
with (security_invoker = true) as
  select
    sbu_id,
    period_month,
    sum(coalesce(mo_target_rev, 0)) as mo_target_rev,
    sum(coalesce(mo_target_vol, 0)) as mo_target_vol
  from public.target
  group by sbu_id, period_month;
