-- ============================================================
-- Ops Flash Report — seed.sql
-- Static SBU dimension (source: protocol.md SBU ID map).
-- Targets are refreshed monthly by the ETL; the Sep-2026 block
-- below is a starting example only.
-- ============================================================

insert into public.sbu (id, code, name, is_freight, is_active, notes) values
  (19,  'NXPL',    'NexaGroup Particle/Fibre',      false, true,  null),
  (36,  'NXES',      'NexaGroup Essential Ltd',       false, true,  null),
  (58,  'NXCM',     'NexaGroup Cement Co. Ltd',      false, true,  'intSBUId=0 remapped here'),
  (64,  'NXSL',     'NexaGroup Shipping Lines',      true,  true,  'Freight (GL 3010005)'),
  (69,  'NXRM',    'NexaGroup Mining',    false, true,  null),
  (72,  'NXCL1', 'BTL Coal',                 false, true,  null),
  (77,  'NXCL2', 'DTL Coal + DTL G2G',       false, true,  'BTL_G2G dormant since Jul 2026'),
  (79,  'NXOC',     'NexaGroup Ocean',               true,  true,  'Freight (GL 3010005)'),
  (80,  'NXSL1',   'NXSL1',                   true,  true,  'Freight (GL 3010005)'),
  (81,  'NXMT',     'NexaGroup Marine Tankers',      true,  true,  'Freight (GL 3010005)'),
  (82,  'NXBO',     'NXBO',                     false, true,  null),
  (83,  'NXBP',      'NXBP',                      false, true,  null),
  (84,  'NXIT',     'NexaGroup Industrial Tech',     false, true,  null),
  (86,  'NXHM',     'NXHM',                     false, true,  null),
  (87,  'NXFL',      'NXFL',                      false, true,  null),
  (88,  'NXSE',    'NexaGroup Sea Line',            true,  true,  'Freight (GL 3010005)'),
  (91,  'NXNT',      'NXNT',                      false, true,  null),
  (98,  'NXAB',     'NexaGroup Bitumen Supplies',    false, true,  'Split into Asphalt/Lubex channels'),
  (99,  'NXAL',      'NexaGroup Cartons',             false, true,  null),
  (102, 'NXST',      'NexaGroup Steel',               false, true,  null),
  (109, 'NXAF',     'NexaGroup Agro',                false, true,  null),
  (110, 'NXSC',   'NexaGroup Sea Line SBM LLC',    true,  true,  'Freight (GL 3010005)'),
  (114, 'NXLE',     'NexaGroup Leather',             false, true,  null),
  (115, 'NXAI',     'NexaGroup Adhesives',           false, true,  null),
  (118, 'NXAT',      'NexaGroup Tobacco',             false, true,  null),
  (120, 'NXEF',     'NexaGroup Engineering',         false, true,  null),
  (123, 'NXEN',  'NXES Engineering',          false, true,  'New SBU ~Jul 2026'),
  (124, 'NXBL',      'NexaGroup Bidi',                false, true,  'Persistent gap vs portal — override candidate'),
  (126, 'NXOR',     'NXOR',                     false, true,  'Persistent gap vs portal — override candidate'),
  (128, 'NXMX',     'NXMX',                     false, true,  null),
  (129, 'NXNJ',      'NXNJ',                      false, true,  null),
  (132, 'NXMP',     'NXMP',                     false, true,  null);

-- Recon-only entities (excluded from report scope, in full-GL side of recon)
insert into public.sbu (id, code, name, is_freight, is_active, notes) values
  (103, 'CC_Center', 'City Center',        false, false, 'Recon-only'),
  (116, 'ALCL',      'ALCL',               false, false, 'Recon-only'),
  (119, 'AWT',       'AWT',                false, false, 'Recon-only'),
  (122, 'Cables',    'Cables',             false, false, 'Recon-only'),
  (111, 'Recon_111', 'Recon entity 111',   false, false, 'Recon-only — confirm mapping with finance')
on conflict (id) do nothing;

-- Historical-only entities (appear in FY-to-date journal but outside the
-- active reporting scope). Added so daily_trend FK stays intact and the
-- historical portfolio trend totals remain complete.
insert into public.sbu (id, code, name, is_freight, is_active, notes) values
  (75, 'DiTCL', 'Dominion Trading Company Ltd',  false, false, 'Historical — negligible FY26-27 revenue'),
  (78, 'ETCL',  'Eastern Trading Company Ltd', false, false, 'Historical — negligible FY26-27 revenue')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- Example targets — Sep 2026 (starting point; ETL overwrites monthly
-- from the SBU_Performance_Tracker Google Sheet).
-- ------------------------------------------------------------
insert into public.target (sbu_id, period_month, channel, mo_target_rev, mo_target_vol) values
  (102, '2026-09-01', 'default', 40.95,  4500),
  (58,  '2026-09-01', 'default', 63.00,  58335),
  (36,  '2026-09-01', 'default', 51.03,  8855),
  (69,  '2026-09-01', 'default', 13.79,  null),
  (126, '2026-09-01', 'default', 3.96,  null),
  (109, '2026-09-01', 'default', 38.95,  6395),
  (98,  '2026-09-01', 'lubex',  0.85,  null),
  (98,  '2026-09-01', 'asphalt', 3.50, null),
  (114, '2026-09-01', 'default', 6.98,  394015),
  (86,  '2026-09-01', 'default', 11.95,  1435)
on conflict (sbu_id, period_month, channel) do update
  set mo_target_rev = excluded.mo_target_rev,
      mo_target_vol = excluded.mo_target_vol;
