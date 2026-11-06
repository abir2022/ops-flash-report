-- ============================================================
-- Ops Flash Report — 00007_forecast_history.sql
-- 4-fiscal-year daily revenue history per SBU for the redesigned
-- "FY forecast vs target" section (seasonal index, prior-year
-- same-month overlay, and running-month projection).
--
-- Written by the ETL (apps/etl): a one-time 4-FY backfill, then
-- kept fresh by the daily run (current FY only).
-- ============================================================

create table if not exists public.sbu_daily_history (
  sbu_id  integer not null references public.sbu(id) on delete cascade,
  channel text not null default 'default',
  d       date not null,
  value   numeric(20,6) not null default 0,
  primary key (sbu_id, channel, d)
);

create index if not exists idx_sbu_daily_history_lookup
  on public.sbu_daily_history (sbu_id, channel, d);

alter table public.sbu_daily_history enable row level security;

create policy "sbu_daily_history_select" on public.sbu_daily_history
  for select to authenticated using (true);

-- ------------------------------------------------------------
-- RPC: daily revenue history for one SBU+channel over a range.
-- Takes limit/offset so the client can page past PostgREST's
-- 1000-row response cap (4 FYs of daily rows is ~1.5k per SBU).
-- ------------------------------------------------------------
create or replace function public.get_sbu_history(
  _sbu     integer,
  _channel text,
  _from    date,
  _to      date,
  _limit   integer default 1000,
  _offset  integer default 0
)
returns table (d date, value numeric)
language sql stable security invoker
as $$
  select h.d, h.value
  from public.sbu_daily_history h
  where h.sbu_id = _sbu
    and h.channel = _channel
    and h.d >= _from
    and h.d <= _to
  order by h.d
  limit _limit offset _offset;
$$;
