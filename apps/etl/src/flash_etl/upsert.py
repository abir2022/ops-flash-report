"""Idempotent writes to Supabase Postgres (psycopg, ON CONFLICT upserts)."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import structlog

from .config import Settings
from .db import supabase_conn, supabase_execute
from .models import (
    ItemMaster,
    PartnerFeedDailySale,
    PartnerFeedDailyTotal,
    PartnerFeedOffice,
    PartnerFeedOfficePl,
    MarketingSpend,
    MarketingSpendDetail,
    MarketingSpendMonthly,
    Reconciliation,
    SkuSale,
    Snapshot,
    TrendPoint,
)

log = structlog.get_logger()

_SNAPSHOT_COLS = [
    "sbu_id", "report_date", "channel", "src",
    "daily_rev", "dod_rev", "mtd_rev", "mom_rev", "yoy_rev",
    "fy_ytd_rev", "cy_ytd_rev",
    "daily_vol", "dod_vol", "mtd_vol", "mom_vol", "vol_uom", "has_vol",
    "mo_tgt_rev", "mtd_tgt_rev", "mo_tgt_vol", "mtd_tgt_vol", "mtd_ach_pct",
    "mom_pct", "yoy_pct", "proj_rev", "momentum",
]

_SNAPSHOT_UPSERT = f"""
INSERT INTO public.daily_snapshot ({', '.join(_SNAPSHOT_COLS)})
VALUES ({', '.join(['%s'] * len(_SNAPSHOT_COLS))})
ON CONFLICT (sbu_id, report_date, channel) DO UPDATE SET
  src = EXCLUDED.src,
  daily_rev = EXCLUDED.daily_rev, dod_rev = EXCLUDED.dod_rev,
  mtd_rev = EXCLUDED.mtd_rev, mom_rev = EXCLUDED.mom_rev, yoy_rev = EXCLUDED.yoy_rev,
  fy_ytd_rev = EXCLUDED.fy_ytd_rev, cy_ytd_rev = EXCLUDED.cy_ytd_rev,
  daily_vol = EXCLUDED.daily_vol, dod_vol = EXCLUDED.dod_vol,
  mtd_vol = EXCLUDED.mtd_vol, mom_vol = EXCLUDED.mom_vol,
  vol_uom = EXCLUDED.vol_uom, has_vol = EXCLUDED.has_vol,
  mo_tgt_rev = EXCLUDED.mo_tgt_rev, mtd_tgt_rev = EXCLUDED.mtd_tgt_rev,
  mo_tgt_vol = EXCLUDED.mo_tgt_vol, mtd_tgt_vol = EXCLUDED.mtd_tgt_vol,
  mtd_ach_pct = EXCLUDED.mtd_ach_pct, mom_pct = EXCLUDED.mom_pct,
  yoy_pct = EXCLUDED.yoy_pct, proj_rev = EXCLUDED.proj_rev, momentum = EXCLUDED.momentum,
  created_at = now()
"""


def _snapshot_tuple(s: Snapshot) -> tuple:
    return (
        s.sbu_id, s.report_date, s.channel, s.src,
        s.daily_rev, s.dod_rev, s.mtd_rev, s.mom_rev, s.yoy_rev,
        s.fy_ytd_rev, s.cy_ytd_rev,
        s.daily_vol, s.dod_vol, s.mtd_vol, s.mom_vol, s.vol_uom, s.has_vol,
        s.mo_tgt_rev, s.mtd_tgt_rev, s.mo_tgt_vol, s.mtd_tgt_vol, s.mtd_ach_pct,
        s.mom_pct, s.yoy_pct, s.proj_rev, s.momentum,
    )


def upsert_snapshots(settings: Settings, snapshots: list[Snapshot]) -> int:
    if not snapshots:
        return 0
    rows = [_snapshot_tuple(s) for s in snapshots]
    with supabase_conn(settings) as conn:
        with conn.cursor() as cur:
            cur.executemany(_SNAPSHOT_UPSERT, rows)
        conn.commit()
    log.info("upserted snapshots", count=len(rows))
    return len(rows)


def upsert_trend(settings: Settings, trend: list[TrendPoint]) -> int:
    if not trend:
        return 0
    sql = """
    INSERT INTO public.daily_trend (sbu_id, d, channel, value)
    VALUES (%s, %s, %s, %s)
    ON CONFLICT (sbu_id, d, channel) DO UPDATE SET value = EXCLUDED.value
    """
    rows = [(t.sbu_id, t.d, t.channel, t.value) for t in trend]
    with supabase_conn(settings) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, rows)
        conn.commit()
    log.info("upserted trend", count=len(rows))
    return len(rows)


def upsert_history(settings: Settings, trend: list[TrendPoint]) -> int:
    if not trend:
        return 0
    sql = """
    INSERT INTO public.sbu_daily_history (sbu_id, channel, d, value)
    VALUES (%s, %s, %s, %s)
    ON CONFLICT (sbu_id, channel, d) DO UPDATE SET value = EXCLUDED.value
    """
    rows = [(t.sbu_id, t.channel, t.d, t.value) for t in trend]
    with supabase_conn(settings) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, rows)
        conn.commit()
    log.info("upserted history", count=len(rows))
    return len(rows)


def upsert_reconciliation(settings: Settings, r: Reconciliation) -> None:
    sql = """
    INSERT INTO public.reconciliation
      (report_date, g1all, excl, g2all, g5all, g6all, g4all,
       rpt_gl1, rpt_frt, rpt_tot, full_tot, gap)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (report_date) DO UPDATE SET
      g1all = EXCLUDED.g1all, excl = EXCLUDED.excl, g2all = EXCLUDED.g2all,
      g5all = EXCLUDED.g5all, g6all = EXCLUDED.g6all, g4all = EXCLUDED.g4all,
      rpt_gl1 = EXCLUDED.rpt_gl1, rpt_frt = EXCLUDED.rpt_frt,
      rpt_tot = EXCLUDED.rpt_tot, full_tot = EXCLUDED.full_tot, gap = EXCLUDED.gap,
      created_at = now()
    """
    supabase_execute(
        settings,
        sql,
        (
            r.report_date, r.g1all, r.excl, r.g2all, r.g5all, r.g6all, r.g4all,
            r.rpt_gl1, r.rpt_frt, r.rpt_tot, r.full_tot, r.gap,
        ),
    )
    log.info("upserted reconciliation", report_date=str(r.report_date), gap=r.gap)


def start_refresh_run(settings: Settings, report_date, dwh_latest_post) -> UUID:
    sql = """
    INSERT INTO public.refresh_run (status, report_date, dwh_latest_post)
    VALUES ('running', %s, %s) RETURNING id
    """
    with supabase_conn(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (report_date, dwh_latest_post))
            row = cur.fetchone()
            assert row is not None
            run_id = row[0]
        conn.commit()
    return run_id


def finish_refresh_run(
    settings: Settings,
    run_id: UUID,
    status: str,
    report_date,
    dwh_synced_at: datetime | None = None,
    error: str = "",
    meta: dict | None = None,
) -> None:
    sql = """
    UPDATE public.refresh_run
    SET status = %s, finished_at = %s, dwh_synced_at = %s, error = %s, meta = %s
    WHERE id = %s
    """
    import json

    supabase_execute(
        settings,
        sql,
        (
            status,
            datetime.now(UTC),
            dwh_synced_at,
            error or None,
            json.dumps(meta or {}),
            run_id,
        ),
    )
    log.info("finished refresh run", run_id=str(run_id), status=status)


def upsert_item_master(settings: Settings, rows: list[ItemMaster]) -> int:
    if not rows:
        return 0
    sql = """
    INSERT INTO public.item_master
      (item_id, item_code, item_name, category_id, category_name, is_active)
    VALUES (%s, %s, %s, %s, %s, true)
    ON CONFLICT (item_id) DO UPDATE SET
      item_code = COALESCE(EXCLUDED.item_code, public.item_master.item_code),
      item_name = COALESCE(EXCLUDED.item_name, public.item_master.item_name),
      category_id = COALESCE(EXCLUDED.category_id, public.item_master.category_id),
      category_name = COALESCE(EXCLUDED.category_name, public.item_master.category_name)
    """
    tuples = [
        (r.item_id, r.item_code, r.item_name, r.category_id, r.category_name)
        for r in rows
    ]
    with supabase_conn(settings) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, tuples)
        conn.commit()
    log.info("upserted item_master", count=len(tuples))
    return len(tuples)


def upsert_sku_sales(settings: Settings, rows: list[SkuSale]) -> int:
    if not rows:
        return 0
    sql = """
    INSERT INTO public.sku_sales_daily (sbu_id, channel, item_id, d, quantity, uom, value)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (sbu_id, channel, item_id, d) DO UPDATE SET
      quantity = EXCLUDED.quantity, uom = EXCLUDED.uom, value = EXCLUDED.value
    """
    tuples = [
        (r.sbu_id, r.channel, r.item_id, r.d, r.quantity, r.uom, r.value)
        for r in rows
    ]
    with supabase_conn(settings) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, tuples)
        conn.commit()
    log.info("upserted sku_sales", count=len(tuples))
    return len(tuples)


def upsert_marketing_spend(settings: Settings, rows: list[MarketingSpend]) -> int:
    if not rows:
        return 0
    sql = """
    INSERT INTO public.marketing_spend
      (sbu_id, report_date, mtd_spend, mom_spend, yoy_spend, fy_ytd_spend)
    VALUES (%s, %s, %s, %s, %s, %s)
    ON CONFLICT (sbu_id, report_date) DO UPDATE SET
      mtd_spend = EXCLUDED.mtd_spend, mom_spend = EXCLUDED.mom_spend,
      yoy_spend = EXCLUDED.yoy_spend, fy_ytd_spend = EXCLUDED.fy_ytd_spend,
      created_at = now()
    """
    tuples = [
        (r.sbu_id, r.report_date, r.mtd, r.mom, r.yoy, r.fy_ytd)
        for r in rows
    ]
    with supabase_conn(settings) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, tuples)
        conn.commit()
    log.info("upserted marketing_spend", count=len(tuples))
    return len(tuples)


def upsert_marketing_spend_detail(settings: Settings, rows: list[MarketingSpendDetail]) -> int:
    if not rows:
        return 0
    sql = """
    INSERT INTO public.marketing_spend_detail
      (sbu_id, report_date, subgl_code, subgl_name, mtd_spend)
    VALUES (%s, %s, %s, %s, %s)
    ON CONFLICT (sbu_id, report_date, subgl_code) DO UPDATE SET
      subgl_name = EXCLUDED.subgl_name, mtd_spend = EXCLUDED.mtd_spend,
      created_at = now()
    """
    tuples = [
        (r.sbu_id, r.report_date, r.subgl_code, r.subgl_name, r.mtd)
        for r in rows
    ]
    with supabase_conn(settings) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, tuples)
        conn.commit()
    log.info("upserted marketing_spend_detail", count=len(tuples))
    return len(tuples)


def upsert_marketing_spend_monthly(settings: Settings, rows: list[MarketingSpendMonthly]) -> int:
    if not rows:
        return 0
    sql = """
    INSERT INTO public.marketing_spend_monthly (sbu_id, period_month, spend)
    VALUES (%s, %s, %s)
    ON CONFLICT (sbu_id, period_month) DO UPDATE SET
      spend = EXCLUDED.spend, created_at = now()
    """
    tuples = [(r.sbu_id, r.period_month, r.spend) for r in rows]
    with supabase_conn(settings) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, tuples)
        conn.commit()
    log.info("upserted marketing_spend_monthly", count=len(tuples))
    return len(tuples)


def upsert_marketing_spend_campaignable(settings: Settings, rows: list[MarketingSpend]) -> int:
    if not rows:
        return 0
    sql = """
    INSERT INTO public.marketing_spend_campaignable
      (sbu_id, report_date, mtd_spend, mom_spend, yoy_spend, fy_ytd_spend)
    VALUES (%s, %s, %s, %s, %s, %s)
    ON CONFLICT (sbu_id, report_date) DO UPDATE SET
      mtd_spend = EXCLUDED.mtd_spend, mom_spend = EXCLUDED.mom_spend,
      yoy_spend = EXCLUDED.yoy_spend, fy_ytd_spend = EXCLUDED.fy_ytd_spend,
      created_at = now()
    """
    tuples = [
        (r.sbu_id, r.report_date, r.mtd, r.mom, r.yoy, r.fy_ytd)
        for r in rows
    ]
    with supabase_conn(settings) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, tuples)
        conn.commit()
    log.info("upserted marketing_spend_campaignable", count=len(tuples))
    return len(tuples)


def upsert_marketing_spend_monthly_campaignable(
    settings: Settings, rows: list[MarketingSpendMonthly]
) -> int:
    if not rows:
        return 0
    sql = """
    INSERT INTO public.marketing_spend_monthly_campaignable (sbu_id, period_month, spend)
    VALUES (%s, %s, %s)
    ON CONFLICT (sbu_id, period_month) DO UPDATE SET
      spend = EXCLUDED.spend, created_at = now()
    """
    tuples = [(r.sbu_id, r.period_month, r.spend) for r in rows]
    with supabase_conn(settings) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, tuples)
        conn.commit()
    log.info("upserted marketing_spend_monthly_campaignable", count=len(tuples))
    return len(tuples)


def upsert_partner_feed_offices(settings: Settings, rows: list[PartnerFeedOffice]) -> int:
    if not rows:
        return 0
    sql = """
    INSERT INTO public.partner_feed_office (office_id, name, address)
    VALUES (%s, %s, %s)
    ON CONFLICT (office_id) DO UPDATE SET
      name = EXCLUDED.name,
      address = COALESCE(EXCLUDED.address, public.partner_feed_office.address),
      created_at = now()
    """
    tuples = [(r.office_id, r.name, r.address) for r in rows]
    with supabase_conn(settings) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, tuples)
        conn.commit()
    log.info("upserted partner_feed_office", count=len(tuples))
    return len(tuples)


def upsert_partner_feed_daily_total(settings: Settings, rows: list[PartnerFeedDailyTotal]) -> int:
    if not rows:
        return 0
    sql = """
    INSERT INTO public.partner_feed_daily_total (report_date, amount)
    VALUES (%s, %s)
    ON CONFLICT (report_date) DO UPDATE SET
      amount = EXCLUDED.amount, created_at = now()
    """
    tuples = [(r.report_date, r.amount) for r in rows]
    with supabase_conn(settings) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, tuples)
        conn.commit()
    log.info("upserted partner_feed_daily_total", count=len(tuples))
    return len(tuples)


def upsert_partner_feed_daily_sales(settings: Settings, rows: list[PartnerFeedDailySale]) -> int:
    if not rows:
        return 0
    sql = """
    INSERT INTO public.partner_feed_daily_sales (report_date, department_name, category_name, amount)
    VALUES (%s, %s, %s, %s)
    ON CONFLICT (report_date, department_name, category_name) DO UPDATE SET
      amount = EXCLUDED.amount, created_at = now()
    """
    tuples = [
        (r.report_date, r.department_name, r.category_name, r.amount) for r in rows
    ]
    with supabase_conn(settings) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, tuples)
        conn.commit()
    log.info("upserted partner_feed_daily_sales", count=len(tuples))
    return len(tuples)


def upsert_partner_feed_office_pl(settings: Settings, rows: list[PartnerFeedOfficePl]) -> int:
    if not rows:
        return 0
    sql = """
    INSERT INTO public.partner_feed_office_pl
      (period_month, office_id, office_name, department_name,
       quantity, net_sales, cost, profit, margin)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (period_month, office_id, department_name) DO UPDATE SET
      office_name = EXCLUDED.office_name,
      quantity = EXCLUDED.quantity, net_sales = EXCLUDED.net_sales,
      cost = EXCLUDED.cost, profit = EXCLUDED.profit, margin = EXCLUDED.margin,
      created_at = now()
    """
    tuples = [
        (
            r.period_month, r.office_id, r.office_name, r.department_name,
            r.quantity, r.net_sales, r.cost, r.profit, r.margin,
        )
        for r in rows
    ]
    with supabase_conn(settings) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, tuples)
        conn.commit()
    log.info("upserted partner_feed_office_pl", count=len(tuples))
    return len(tuples)
