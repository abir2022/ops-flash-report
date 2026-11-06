-- ============================================================
-- Ops Flash Report — 00027_partner_feed.sql
-- Partner Feed (demo retail chain) flash-report data.
--
-- Pulled from the partner portal (partner-portal.example.com) by the
-- ETL (apps/etl/src/flash_etl/partner_feed.py). Unlike the DWH-sourced tables,
-- all money here is raw BDT (Tk), not crore.
--
--   * partner_feed_office       — outlet dimension (derived from the portal P&L office list).
--   * partner_feed_daily_total  — company-wide daily POS sales (BDT).
--   * partner_feed_daily_sales  — daily POS sales by department x category (BDT).
--   * partner_feed_office_pl    — monthly net P&L per outlet x department (BDT).
--
-- Admin-only (the PartnerFeed tab is admin-gated, matching the Marketing tab).
-- ============================================================

-- ------------------------------------------------------------
-- Outlet dimension
-- ------------------------------------------------------------
create table if not exists public.partner_feed_office (
  office_id  integer primary key,
  name       text not null,
  address    text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Company-wide daily POS sales (grand total per day)
-- ------------------------------------------------------------
create table if not exists public.partner_feed_daily_total (
  report_date date primary key,
  amount      numeric(18,2) not null,   -- company daily sales (BDT)
  created_at  timestamptz not null default now()
);

create index if not exists idx_partner_feed_daily_total_date
  on public.partner_feed_daily_total (report_date);

-- ------------------------------------------------------------
-- Daily POS sales by department x category (BDT)
-- ------------------------------------------------------------
create table if not exists public.partner_feed_daily_sales (
  report_date     date not null,
  department_name text not null,
  category_name   text not null,
  amount          numeric(18,2) not null,   -- BDT
  created_at      timestamptz not null default now(),
  primary key (report_date, department_name, category_name)
);

create index if not exists idx_partner_feed_daily_sales_date
  on public.partner_feed_daily_sales (report_date);

-- ------------------------------------------------------------
-- Monthly net P&L per outlet x department (BDT)
-- ------------------------------------------------------------
create table if not exists public.partner_feed_office_pl (
  period_month    date not null,            -- first day of the reporting month
  office_id       integer not null,
  office_name     text not null,
  department_name text not null,
  quantity        numeric(20,4) not null default 0,
  net_sales       numeric(18,2) not null default 0,   -- BDT
  cost            numeric(18,2) not null default 0,   -- BDT
  profit          numeric(18,2) not null default 0,   -- BDT
  margin          numeric(10,4) not null default 0,   -- profit / net_sales * 100
  created_at      timestamptz not null default now(),
  primary key (period_month, office_id, department_name)
);

create index if not exists idx_partner_feed_office_pl_month
  on public.partner_feed_office_pl (period_month);

-- ------------------------------------------------------------
-- RLS: admin-only (PartnerFeed tab is admin-gated).
-- ------------------------------------------------------------
alter table public.partner_feed_office enable row level security;
alter table public.partner_feed_daily_total enable row level security;
alter table public.partner_feed_daily_sales enable row level security;
alter table public.partner_feed_office_pl enable row level security;

create policy "partner_feed_office_select" on public.partner_feed_office
  for select to authenticated using (public.auth_is_admin());

create policy "partner_feed_daily_total_select" on public.partner_feed_daily_total
  for select to authenticated using (public.auth_is_admin());

create policy "partner_feed_daily_sales_select" on public.partner_feed_daily_sales
  for select to authenticated using (public.auth_is_admin());

create policy "partner_feed_office_pl_select" on public.partner_feed_office_pl
  for select to authenticated using (public.auth_is_admin());
