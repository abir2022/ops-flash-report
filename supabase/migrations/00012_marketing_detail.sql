-- ============================================================
-- Ops Flash Report — 00012_marketing_detail.sql
-- Marketing spend SubGL purpose breakdown + monthly series for the
-- Marketing Analysis tab (admin-only). Extends 00011_marketing.sql:
--   * marketing_spend_detail  — one row per (sbu, report_date, subgl)
--     so the tab can answer "what is this month's spend made of".
--   * marketing_spend_monthly — one row per (sbu, month) so the tab
--     can draw a spend trend line (explains the "Spend MoM" column).
-- Data is written by the ETL; until backfill the views return no rows.
-- ============================================================

-- ------------------------------------------------------------
-- SubGL purpose breakdown (GL 4210001). Grouped at the SubGL
-- level, so "Advertisement & Publicity", "Commission & Discount",
-- "Salary & Allowances", etc. can be shown per SBU per month.
-- ------------------------------------------------------------
create table if not exists public.marketing_spend_detail (
  sbu_id      integer not null references public.sbu(id) on delete cascade,
  report_date date not null,
  subgl_code  text not null,
  subgl_name  text not null,
  mtd_spend   numeric(20,6),   -- MTD GL 4210001 spend for this SubGL (Cr)
  created_at  timestamptz not null default now(),
  primary key (sbu_id, report_date, subgl_code)
);

create index if not exists idx_marketing_spend_detail_date
  on public.marketing_spend_detail (report_date);

alter table public.marketing_spend_detail enable row level security;

create policy "marketing_spend_detail_select" on public.marketing_spend_detail
  for select to authenticated
  using (public.auth_is_admin());

-- ------------------------------------------------------------
-- Monthly marketing spend series (GL 4210001). period_month is
-- the first day of the calendar month. One row per (sbu, month).
-- ------------------------------------------------------------
create table if not exists public.marketing_spend_monthly (
  sbu_id       integer not null references public.sbu(id) on delete cascade,
  period_month date not null,
  spend        numeric(20,6),   -- total GL 4210001 spend for the month (Cr)
  created_at   timestamptz not null default now(),
  primary key (sbu_id, period_month)
);

create index if not exists idx_marketing_spend_monthly_sbu
  on public.marketing_spend_monthly (sbu_id, period_month);

alter table public.marketing_spend_monthly enable row level security;

create policy "marketing_spend_monthly_select" on public.marketing_spend_monthly
  for select to authenticated
  using (public.auth_is_admin());

-- ------------------------------------------------------------
-- Read views (security_invoker so RLS on the base tables applies).
-- ------------------------------------------------------------
create or replace view public.v_marketing_spend_detail
with (security_invoker = true) as
  select
    d.sbu_id,
    sbu.code,
    sbu.name,
    sbu.section,
    d.report_date,
    d.subgl_code,
    d.subgl_name,
    d.mtd_spend
  from public.marketing_spend_detail d
  join public.sbu sbu on sbu.id = d.sbu_id;

create or replace view public.v_marketing_spend_monthly
with (security_invoker = true) as
  select
    m.sbu_id,
    sbu.code,
    sbu.name,
    m.period_month,
    m.spend
  from public.marketing_spend_monthly m
  join public.sbu sbu on sbu.id = m.sbu_id;
