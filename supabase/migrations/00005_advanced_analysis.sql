-- ============================================================
-- Ops Flash Report — 00005_advanced_analysis.sql
-- Item/SKU-level fact + item dimension + RLS + read RPCs for the
-- "Advanced Analysis" tab (SKU ABC / weekday / season / trend).
--
-- Data is written by the ETL (apps/etl). Until the ETL backfills
-- these tables the RPCs simply return no rows (the tab shows a
-- graceful "no data" state).
-- ============================================================

-- ------------------------------------------------------------
-- Item (SKU) dimension — one row per DWH item id (global master).
-- ------------------------------------------------------------
create table if not exists public.item_master (
  item_id       integer primary key,
  item_code     text,
  item_name     text,
  category_id   integer,
  category_name text,
  is_active     boolean not null default true
);

-- ------------------------------------------------------------
-- Item-level daily sales fact.
-- quantity = delivery quantity in the item's own UOM.
-- value    = revenue (Cr) attributed to the item (net of returns).
-- One row per (sbu, channel, item, day).
-- ------------------------------------------------------------
create table if not exists public.sku_sales_daily (
  sbu_id   integer not null references public.sbu(id) on delete cascade,
  channel  text not null default 'default',
  item_id  integer not null references public.item_master(item_id) on delete cascade,
  d        date not null,
  quantity numeric(20,3),
  uom      text,
  value    numeric(20,6),
  primary key (sbu_id, channel, item_id, d)
);

create index if not exists idx_sku_sales_lookup
  on public.sku_sales_daily (sbu_id, channel, d);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.item_master     enable row level security;
alter table public.sku_sales_daily enable row level security;

create policy "item_master_select" on public.item_master
  for select to authenticated using (true);

create policy "sku_sales_select" on public.sku_sales_daily
  for select to authenticated using (true);

-- ------------------------------------------------------------
-- Active SBU dimension (feeds the Advanced Analysis SBU picker).
-- ------------------------------------------------------------
create or replace view public.v_sbu
with (security_invoker = true) as
  select id, code, name, section, is_freight, is_active
  from public.sbu
  where is_active
  order by id;

-- ------------------------------------------------------------
-- RPC: daily revenue/quantity for one SBU+channel over a range
-- (sums the item-level fact, so it is empty until the ETL runs).
-- ------------------------------------------------------------
create or replace function public.get_sbu_daily(
  _sbu     integer,
  _channel text,
  _from    date,
  _to      date
)
returns table (d date, value numeric, quantity numeric)
language sql stable security invoker
as $$
  select
    s.d,
    sum(s.value)::numeric    as value,
    sum(s.quantity)::numeric as quantity
  from public.sku_sales_daily s
  where s.sbu_id = _sbu
    and s.channel = _channel
    and s.d >= _from
    and s.d <= _to
  group by s.d
  order by s.d;
$$;

-- ------------------------------------------------------------
-- RPC: item-level totals for one SBU+channel over a range
-- (feeds the SKU ABC / Pareto module).
-- ------------------------------------------------------------
create or replace function public.get_sku_sales(
  _sbu     integer,
  _channel text,
  _from    date,
  _to      date
)
returns table (
  item_id       integer,
  item_code     text,
  item_name     text,
  category_name text,
  quantity      numeric,
  uom           text,
  value         numeric
)
language sql stable security invoker
as $$
  select
    s.item_id,
    m.item_code,
    m.item_name,
    m.category_name,
    sum(s.quantity)::numeric as quantity,
    max(s.uom)               as uom,
    sum(s.value)::numeric    as value
  from public.sku_sales_daily s
  left join public.item_master m on m.item_id = s.item_id
  where s.sbu_id = _sbu
    and s.channel = _channel
    and s.d >= _from
    and s.d <= _to
  group by s.item_id, m.item_code, m.item_name, m.category_name
  order by value desc;
$$;
