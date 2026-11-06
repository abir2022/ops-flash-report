-- ============================================================
-- Ops Flash Report — 00026_marketing_led_target.sql
-- Add FY2026-27 "marketing-led revenue" targets (annual, in Crore)
-- to the ROMI SBU dimension (public.romi_sbu).
--
-- The Marketing team set these per SBU. Several are ranges, so we
-- store a min and a max; single values carry min == max. The NXAI
-- Tyre brand targets (three partner tyre brands)
-- are summed into one NXAI target of 17.82 Cr.
--
-- Shown in the Marketing tab's "Marketing Led Overview" table next
-- to Marketing-led Revenue.
-- ============================================================

alter table public.romi_sbu
  add column if not exists mkt_led_target_min_cr double precision,
  add column if not exists mkt_led_target_max_cr double precision;

-- Seed by code (idempotent). 18 marketing SBUs -> 16 unique codes.
update public.romi_sbu set mkt_led_target_min_cr = 136.67, mkt_led_target_max_cr = 136.67 where code = 'NXCM';  -- NexaGroup Cement
update public.romi_sbu set mkt_led_target_min_cr = 218.67, mkt_led_target_max_cr = 218.67 where code = 'NXST';   -- NEXAGROUP Steel
update public.romi_sbu set mkt_led_target_min_cr =  16.67, mkt_led_target_max_cr =  26.67 where code = 'NXRM'; -- NEXAGROUP Readymix
update public.romi_sbu set mkt_led_target_min_cr = 74.00, mkt_led_target_max_cr = 78.33 where code = 'NXES';   -- NexaGroup Essential
update public.romi_sbu set mkt_led_target_min_cr = 81.67, mkt_led_target_max_cr = 81.67 where code = 'NXAF';  -- NEXAGROUP Feed
update public.romi_sbu set mkt_led_target_min_cr =  10.90, mkt_led_target_max_cr =  10.90 where code = 'ALCL';  -- NEXAGROUP Pharmacy (PartnerFeed)
update public.romi_sbu set mkt_led_target_min_cr =   2.33, mkt_led_target_max_cr =   2.33 where code = 'NXMP';  -- NEXAGROUP Mediplex
update public.romi_sbu set mkt_led_target_min_cr =  3.33, mkt_led_target_max_cr =  3.33 where code = 'AMQL';  -- NexaGroup Mediquip
update public.romi_sbu set mkt_led_target_min_cr = 54.67, mkt_led_target_max_cr = 54.67 where code = 'NXLE';  -- NXLE (ENOVAR)
update public.romi_sbu set mkt_led_target_min_cr =  4.47, mkt_led_target_max_cr =  4.47 where code = 'ACEL';  -- Consumer Electronics (ORCA)
update public.romi_sbu set mkt_led_target_min_cr =  12.00, mkt_led_target_max_cr =  12.00 where code = 'NXAL';   -- Commodities (OASIS)
update public.romi_sbu set mkt_led_target_min_cr =  5.94, mkt_led_target_max_cr =  5.94 where code = 'NXAI';  -- Tyre (partner brands)
update public.romi_sbu set mkt_led_target_min_cr =  3.70, mkt_led_target_max_cr =  6.67 where code = 'AASL';  -- NEXAGROUP Air
update public.romi_sbu set mkt_led_target_min_cr =   0.46, mkt_led_target_max_cr =   0.46 where code = 'NXNJ';   -- NextJobs
update public.romi_sbu set mkt_led_target_min_cr =  10.00, mkt_led_target_max_cr =  13.33 where code = 'AALL';  -- NEXAGROUP AgriLife
update public.romi_sbu set mkt_led_target_min_cr =  25.78, mkt_led_target_max_cr =  25.78 where code = 'ALML';  -- NEXAGROUP Landmark

-- Expose the new columns through the read view. NOTE: appended at the END of
-- the select list so CREATE OR REPLACE VIEW can add them (Postgres forbids
-- reordering/renaming existing view columns in-place).
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
    m.sbu_id,
    rs.mkt_led_target_min_cr,
    rs.mkt_led_target_max_cr
  from public.romi_sbu rs
  left join public.sbu_romi_map m on m.business_unit_id = rs.business_unit_id;
