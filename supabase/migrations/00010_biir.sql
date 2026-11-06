-- ============================================================
-- Ops Flash Report — 00010_biir.sql
-- Business Impact Intelligence Radar (BIIR) — external signal store.
--
-- The BIIR tab computes internal risk from the live scorecard and
-- combines it with these external signals. The client falls back to a
-- built-in baseline catalogue when this table is empty, so the tab is
-- never blank. Update rows here (or via the ETL / market-intel feed)
-- every 6–12 hours to keep the radar current.
-- ============================================================

-- ------------------------------------------------------------
-- External intelligence signal (one row per monitored factor).
-- category: fuel | energy | fx | commodity | crisis | supply | market
-- severity: low | medium | critical
-- ------------------------------------------------------------
create table if not exists public.biir_signal (
  id          text primary key,
  category    text not null default 'market',
  name        text not null,
  value       numeric(20,4) not null default 0,
  unit        text,
  change_pct  numeric(12,4) not null default 0,
  direction   text not null default 'flat',          -- up | down | flat
  severity    text not null default 'medium',        -- low | medium | critical
  note        text,
  source      text,
  updated_at  timestamptz not null default now(),
  active      boolean not null default true
);

create index if not exists idx_biir_signal_active on public.biir_signal (active, category);

-- ------------------------------------------------------------
-- RLS: readable by any authenticated user (not SBU-scoped, so it
-- follows the same policy as reconciliation / refresh_run).
-- ------------------------------------------------------------
alter table public.biir_signal enable row level security;

create policy "biir_signal_select" on public.biir_signal
  for select to authenticated using (true);

-- ------------------------------------------------------------
-- Baseline catalogue (starting reference values; overwrite these as
-- live market intel arrives — they are configuration, not measured
-- facts).
-- ------------------------------------------------------------
insert into public.biir_signal
  (id, category, name, value, unit, change_pct, direction, severity, note, source, updated_at)
values
  ('diesel',   'fuel', 'Diesel',      135, 'BDT/L', 17.4, 'up', 'critical', 'Diesel up ~17% (115→135) — heavy haulage & distribution cost pressure across logistics/manufacturing.', 'Baseline reference — update via biir_signal / market intel', now()),
  ('octane',   'fuel', 'Octane',      165, 'BDT/L', 13.8, 'up', 'medium',   'Octane up ~14% (145→165) — lifts sales-fleet & delivery operating cost.', 'Baseline reference — update via biir_signal / market intel', now()),
  ('petrol',   'fuel', 'Petrol',      160, 'BDT/L', 14.3, 'up', 'medium',   'Petrol up ~14% (140→160) — raises field/sales mobility cost.', 'Baseline reference — update via biir_signal / market intel', now()),
  ('kerosene', 'fuel', 'Kerosene',    155, 'BDT/L', 14.8, 'up', 'low',      'Kerosene up ~15% (135→155) — minor direct impact, watch auxiliary use.', 'Baseline reference — update via biir_signal / market intel', now()),
  ('gas',     'energy',    'Gas (industrial)',       0,   'index',   5,  'up', 'low',      'Modest gas price pressure on energy-intensive plants.', 'Baseline reference — update via biir_signal / market intel', now()),
  ('power',   'energy',    'Electricity tariff',     0,   'index',   10, 'up', 'medium',   'Tariff hike raises cost base for cement/steel and processing lines.', 'Baseline reference — update via biir_signal / market intel', now()),
  ('usd',     'fx',        'USD / BDT',              122, 'BDT/USD', 4,  'up', 'medium',   'Weaker Taka raises landed cost of imported raw materials.', 'Baseline reference — update via biir_signal / market intel', now()),
  ('coal',    'commodity', 'Coal',                   95,  'USD/MT',  12, 'up', 'critical', 'Coal spike directly compresses BTL/DTL coal & energy-linked margins.', 'Baseline reference — update via biir_signal / market intel', now()),
  ('steel',   'commodity', 'Steel / rebar',          0,   'index',   9,  'up', 'medium',   'Steel input inflation pressures NXST and construction-material margins.', 'Baseline reference — update via biir_signal / market intel', now()),
  ('bitumen', 'commodity', 'Bitumen',                0,   'index',   7,  'up', 'medium',   'Bitumen cost affects NXAB asphalt channel.', 'Baseline reference — update via biir_signal / market intel', now()),
  ('freight', 'supply',    'Ocean freight rates',    0,   'index',   11, 'up', 'critical', 'Routing disruption + higher bunker lift import landed cost and lead times.', 'Baseline reference — update via biir_signal / market intel', now()),
  ('geo',     'crisis',    'Geopolitical tension',   0,   'index',   0,  'up', 'medium',   'Regional shipping/sanctions risk — watch alternative sourcing.', 'Baseline reference — update via biir_signal / market intel', now())
on conflict (id) do update
  set category   = excluded.category,
      name       = excluded.name,
      value      = excluded.value,
      unit       = excluded.unit,
      change_pct = excluded.change_pct,
      direction  = excluded.direction,
      severity   = excluded.severity,
      note       = excluded.note,
      source     = excluded.source,
      updated_at = excluded.updated_at;
