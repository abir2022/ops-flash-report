-- ============================================================
-- Ops Flash Report — 00011_marketing.sql
-- Marketing spend fact + RLS + read view for the "Marketing Analysis"
-- tab (admin-only). Actuals only (no budget): the tab shows GL 4210001
-- marketing spend per SBU and derives ROMI / spend intensity from it.
--
-- Data is written by the ETL (apps/etl). Until the ETL backfills this
-- table the view returns no rows (the tab shows a graceful "no data").
-- ============================================================

-- ------------------------------------------------------------
-- Marketing spend fact. One row per (sbu, report_date) — SBU level
-- (not channel), so NXAB is reported as a single SBU total.
-- All amounts in Crore (Cr), matching the rest of the report.
-- ------------------------------------------------------------
create table if not exists public.marketing_spend (
  sbu_id       integer not null references public.sbu(id) on delete cascade,
  report_date  date not null,
  mtd_spend    numeric(20,6),   -- MTD GL 4210001 spend (Cr)
  mom_spend    numeric(20,6),   -- prior month, same elapsed days
  yoy_spend    numeric(20,6),   -- same month prior year, same elapsed days
  fy_ytd_spend numeric(20,6),   -- FY-start -> report_date+1
  created_at   timestamptz not null default now(),
  primary key (sbu_id, report_date)
);

create index if not exists idx_marketing_spend_date
  on public.marketing_spend (report_date);

-- ------------------------------------------------------------
-- RLS: admin-only (the Marketing Analysis tab is admin-gated).
-- ------------------------------------------------------------
alter table public.marketing_spend enable row level security;

create policy "marketing_spend_select" on public.marketing_spend
  for select to authenticated
  using (public.auth_is_admin());

-- ------------------------------------------------------------
-- Read view (security_invoker so RLS on the base table applies).
-- Joins the SBU dimension for code/name/section.
-- ------------------------------------------------------------
create or replace view public.v_marketing_spend
with (security_invoker = true) as
  select
    m.sbu_id,
    sbu.code,
    sbu.name,
    sbu.section,
    m.report_date,
    m.mtd_spend,
    m.mom_spend,
    m.yoy_spend,
    m.fy_ytd_spend
  from public.marketing_spend m
  join public.sbu sbu on sbu.id = m.sbu_id;
