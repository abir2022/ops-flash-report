-- ============================================================
-- Ops Flash Report — 00019_campaignable_spend.sql
-- Campaign-able marketing spend (GL 4210001 less non-campaign SubGL).
--
-- The Marketing Analysis tab's "Marketing Led Overview" layer switches its
-- spend baseline from the full GL 4210001 (which is ~half trade commission)
-- to the *campaign-able pool*: GL 4210001 minus trade/people/overhead SubGL.
-- The exclusion keywords mirror romi.py's NON_CAMPAIGN_SUBGL_KEYWORDS so the
-- overview and the ROMI campaign ledger stay consistent.
--
--   * marketing_spend_campaignable         — one row per (sbu, report_date)
--     with mtd/mom/yoy/fy_ytd campaign-able spend.
--   * marketing_spend_monthly_campaignable — one row per (sbu, month) for the
--     campaign-able spend trend line.
--
-- Data is written by the ETL; until backfill the views return no rows.
-- ============================================================

create table if not exists public.marketing_spend_campaignable (
  sbu_id       integer not null references public.sbu(id) on delete cascade,
  report_date  date not null,
  mtd_spend    numeric(20,6),   -- MTD campaign-able spend (Cr)
  mom_spend    numeric(20,6),   -- prior month, same elapsed days
  yoy_spend    numeric(20,6),   -- same month prior year, same elapsed days
  fy_ytd_spend numeric(20,6),   -- FY-start -> report_date+1
  created_at   timestamptz not null default now(),
  primary key (sbu_id, report_date)
);

create index if not exists idx_marketing_spend_campaignable_date
  on public.marketing_spend_campaignable (report_date);

alter table public.marketing_spend_campaignable enable row level security;

create policy "marketing_spend_campaignable_select" on public.marketing_spend_campaignable
  for select to authenticated
  using (public.auth_is_admin());

create table if not exists public.marketing_spend_monthly_campaignable (
  sbu_id       integer not null references public.sbu(id) on delete cascade,
  period_month date not null,
  spend        numeric(20,6),   -- campaign-able GL 4210001 spend for the month (Cr)
  created_at   timestamptz not null default now(),
  primary key (sbu_id, period_month)
);

create index if not exists idx_marketing_spend_monthly_campaignable_sbu
  on public.marketing_spend_monthly_campaignable (sbu_id, period_month);

alter table public.marketing_spend_monthly_campaignable enable row level security;

create policy "marketing_spend_monthly_campaignable_select" on public.marketing_spend_monthly_campaignable
  for select to authenticated
  using (public.auth_is_admin());

-- Read views (security_invoker so RLS on the base tables applies).
create or replace view public.v_marketing_spend_campaignable
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
  from public.marketing_spend_campaignable m
  join public.sbu sbu on sbu.id = m.sbu_id;

create or replace view public.v_marketing_spend_monthly_campaignable
with (security_invoker = true) as
  select
    m.sbu_id,
    sbu.code,
    sbu.name,
    m.period_month,
    m.spend
  from public.marketing_spend_monthly_campaignable m
  join public.sbu sbu on sbu.id = m.sbu_id;
