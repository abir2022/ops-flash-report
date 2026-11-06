-- ============================================================
-- Ops Flash Report — 00001_init.sql
-- Schema + indexes. RLS policies are in 00002_rls.sql.
-- ============================================================

create extension if not exists pgcrypto; -- for gen_random_uuid()

-- ------------------------------------------------------------
-- SBU dimension (ported from protocol.md SBU ID map)
-- ------------------------------------------------------------
create table if not exists public.sbu (
  id          integer primary key,
  code        text not null unique,
  name        text,
  is_freight  boolean not null default false,
  is_active   boolean not null default true,
  notes       text
);

-- ------------------------------------------------------------
-- Monthly targets (Cr). NXAB is split by channel.
-- channel is 'default' for a whole-SBU target, else 'asphalt'/'lubex'.
-- mo_target_vol is the raw Target Volume from the tracker (UOM per SBU).
-- ------------------------------------------------------------
create table if not exists public.target (
  id            bigint generated always as identity primary key,
  sbu_id        integer not null references public.sbu(id) on delete cascade,
  period_month  date not null,                       -- first day of the month
  channel       text not null default 'default',
  mo_target_rev numeric(20,6),
  mo_target_vol numeric(20,6),
  unique (sbu_id, period_month, channel)
);

-- ------------------------------------------------------------
-- Daily snapshot: one row per (sbu, report_date, channel).
-- Idempotent: PK upsert on (sbu_id, report_date, channel).
-- ------------------------------------------------------------
create table if not exists public.daily_snapshot (
  sbu_id        integer not null references public.sbu(id) on delete cascade,
  report_date   date not null,
  channel       text not null default 'default',
  src           text,
  -- revenue (Cr, net of returns)
  daily_rev     numeric(20,6),
  dod_rev       numeric(20,6),
  mtd_rev       numeric(20,6),
  mom_rev       numeric(20,6),
  yoy_rev       numeric(20,6),
  fy_ytd_rev    numeric(20,6),
  cy_ytd_rev    numeric(20,6),
  -- volume (raw quantity in the SBU's dominant UOM)
  daily_vol     numeric(20,3),
  dod_vol       numeric(20,3),
  mtd_vol       numeric(20,3),
  mom_vol       numeric(20,3),
  vol_uom       text,
  has_vol       boolean not null default false,
  -- target / achievement / momentum
  mo_tgt_rev    numeric(20,6),
  mtd_tgt_rev   numeric(20,6),
  mo_tgt_vol    numeric(20,6),
  mtd_tgt_vol   numeric(20,6),
  mtd_ach_pct   numeric(12,4),
  mom_pct       numeric(12,4),
  yoy_pct       numeric(12,4),
  proj_rev      numeric(20,6),
  momentum      text,
  created_at    timestamptz not null default now(),
  primary key (sbu_id, report_date, channel)
);

create index if not exists idx_snapshot_date on public.daily_snapshot (report_date);

-- ------------------------------------------------------------
-- Daily revenue trend (the old TD[] series) for drill-downs.
-- ------------------------------------------------------------
create table if not exists public.daily_trend (
  sbu_id    integer not null references public.sbu(id) on delete cascade,
  d         date not null,
  channel   text not null default 'default',
  value     numeric(20,6) not null,
  primary key (sbu_id, d, channel)
);

create index if not exists idx_trend_sbu_date on public.daily_trend (sbu_id, d);

-- ------------------------------------------------------------
-- Per-date reconciliation (two-column card).
-- ------------------------------------------------------------
create table if not exists public.reconciliation (
  report_date  date primary key,
  g1all        numeric(20,6),   -- GL 3010001 all entities
  excl         numeric(20,6),   -- recon-only entities 103,116,119,122,111
  g2all        numeric(20,6),   -- GL 3010002
  g5all        numeric(20,6),   -- GL 3010005
  g6all        numeric(20,6),   -- GL 3010006
  g4all        numeric(20,6),   -- GL 3010004
  rpt_gl1      numeric(20,6),   -- report scope 3010001
  rpt_frt      numeric(20,6),   -- report scope freight
  rpt_tot      numeric(20,6),
  full_tot     numeric(20,6),
  gap          numeric(20,6),
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Pipeline audit log — drives the freshness badge.
-- ------------------------------------------------------------
create table if not exists public.refresh_run (
  id                uuid primary key default gen_random_uuid(),
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  status            text not null default 'running',  -- running|success|failed|stalled
  report_date       date,
  dwh_latest_post   timestamptz,
  dwh_synced_at     timestamptz,
  error             text,
  meta              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists idx_refresh_run_created on public.refresh_run (created_at desc);

-- ------------------------------------------------------------
-- Manual overrides (formalizes NXBL / NXOR / NXLE corrections).
-- ------------------------------------------------------------
create table if not exists public.override (
  id           uuid primary key default gen_random_uuid(),
  sbu_id       integer not null references public.sbu(id) on delete cascade,
  report_date  date not null,
  field        text not null,            -- e.g. 'mtd_rev'
  value        numeric(20,6) not null,
  note         text,
  approved_by  text,
  created_at   timestamptz not null default now(),
  unique (sbu_id, report_date, field)
);
