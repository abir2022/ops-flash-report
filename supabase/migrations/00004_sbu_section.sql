-- ============================================================
-- Ops Flash Report — 00004_sbu_section.sql
-- Add the business-unit "Section" (DWH strBusinessUnitGroupName) to the SBU
-- dimension and refresh names to the full legal company names from the DWH
-- (fin.tblBusinessAreaArc / dco.tblbusinessunitArc).
-- ============================================================

alter table public.sbu add column if not exists section text;

update public.sbu as t
set
  name    = v.name,
  section = v.section
from (values
  (19,  'NexaGroup Poly Fibre Industries Ltd.',                   'Packaging'),
  (36,  'NexaGroup Essentials Ltd.',                              'Food'),
  (58,  'NexaGroup Cement Company Ltd.',                          'Building Material'),
  (64,  'NexaGroup Shipping Line Ltd.',                           'Logistics'),
  (69,  'NexaGroup Ready Mix Concrete Ltd',                       'Building Solution'),
  (72,  'Bengal Traders Ltd',                                 'Trading'),
  (75,  'Dominion Trading Company Ltd',                        'Trading'),
  (77,  'Deltas Trading Company Ltd',                         'Trading'),
  (78,  'Eastern Trading Company Ltd',                       'Trading'),
  (79,  'NexaGroup Ocean Line Ltd.',                              'Logistics'),
  (80,  'NEXAGROUP SHIPPING LINES PTE LTD, SINGAPORE',            'Logistics'),
  (81,  'NexaGroup Maritime Limited',                             'Logistics'),
  (82,  'NexaSoft Limited',                                      'IT'),
  (83,  'Bright Byte Limited',                                 'IT'),
  (84,  'NexaGroup InfoTech Ltd.',                                'IT'),
  (86,  'Harvest Rice Mills Ltd.',                            'Food'),
  (87,  'Greenfield Agro Ltd.',                                   'Food'),
  (88,  'NexaGroup Sea Line Limited',                             'Logistics'),
  (91,  'Novel Traders Ltd.',                              'Trading'),
  (98,  'NexaGroup Building Solutions Limited',                   'Building Solution'),
  (99,  'NexaGroup Commodities Ltd.',                             'Trading'),
  (102, 'NexaGroup Steel Limited',                                'Building Material'),
  (103, 'NexaGroup Logistics Ltd.',                               'Others'),
  (109, 'NexaGroup Agro Feed Ltd.',                               'Food'),
  (110, 'NEXAGROUP SEA LINE SHIP MANAGEMENT AND OPERATION L.L.C', 'Logistics'),
  (111, 'Skyline Travel & Tours',                  'Others'),
  (114, 'NexaGroup Light Engineering Limited',                    'Others'),
  (115, 'NEXAGROUP Automobile Industries Ltd.',                   'Others'),
  (116, 'Partner Feed Ltd.',                                'Others'),
  (118, 'NEXAGROUP Telecom Limited',                              'Others'),
  (119, 'Fields Agro Essence',                               'Others'),
  (120, 'NexaGroup Electrofab Limited',                           'Others'),
  (122, 'NexaGroup Air Service Ltd.',                             'Others'),
  (123, 'NexaGroup Engineering Ltd.',                             'Others'),
  (124, 'NexaGroup Breeders Limited',                             'Others'),
  (126, 'NEXAGROUP Consumer Electronics Limited',                 'Others'),
  (128, 'NEXAGROUP MoveX Ltd.',                                   'Others'),
  (129, 'NextJobs Limited',                                  'Others'),
  (132, 'NexaGroup Mediplex Limited',                             'Others')
) as v(id, name, section)
where t.id = v.id;

-- Expose the section on the scorecard view.
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
    s.report_date,
    sbu.section
  from public.daily_snapshot s
  join public.sbu sbu on sbu.id = s.sbu_id;
