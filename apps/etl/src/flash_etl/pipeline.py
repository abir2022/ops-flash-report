"""ETL orchestration: DWH -> validate -> compute -> Supabase."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta, timezone

import structlog

from .alert import send_alert
from .compute import build_sku_sales, build_snapshots, split_nxab
from .config import Settings
from .constants import GL_REVENUE, GL_SALES_LOCAL
from .dates import DateContext, build_date_context
from .db import dwh_query
from .models import (
    ItemMaster,
    MarketingSpend,
    MarketingSpendDetail,
    MarketingSpendMonthly,
    Reconciliation,
    SbuRevenue,
    SbuVolume,
    SkuSale,
    Snapshot,
    Target,
    TrendPoint,
)
from .queries import (
    NXAB_SPLIT_SQL,
    HISTORY_SQL,
    MARKETING_SPEND_CAMPAIGNABLE_SQL,
    MARKETING_SPEND_DETAIL_SQL,
    MARKETING_SPEND_MONTHLY_CAMPAIGNABLE_SQL,
    MARKETING_SPEND_MONTHLY_SQL,
    MARKETING_SPEND_SQL,
    RECON_SQL,
    REVENUE_SQL,
    SKU_QUANTITY_SQL,
    SYNC_HEALTH_SQL,
    TREND_SQL,
    VOLUME_SQL,
    item_master_sql,
)
from .romi import refresh_romi
from .targets import fetch_all_targets, targets_for_month
from .upsert import (
    finish_refresh_run,
    start_refresh_run,
    upsert_history,
    upsert_item_master,
    upsert_partner_feed_daily_sales,
    upsert_partner_feed_daily_total,
    upsert_partner_feed_office_pl,
    upsert_partner_feed_offices,
    upsert_marketing_spend,
    upsert_marketing_spend_campaignable,
    upsert_marketing_spend_detail,
    upsert_marketing_spend_monthly,
    upsert_marketing_spend_monthly_campaignable,
    upsert_reconciliation,
    upsert_sku_sales,
    upsert_snapshots,
    upsert_trend,
)
from .validate import check_sync_health, run_regression_checks

log = structlog.get_logger()

# The DWH stores naive datetimes in Bangladesh local time (UTC+6); the ETL
# normalizes them to UTC so they compare cleanly against now_utc and store
# correctly in Postgres timestamptz columns.
DHAKA = timezone(timedelta(hours=6))


def run(settings: Settings) -> None:
    # Report on T-1 (last complete day): today's GL journal is still
    # accruing, so "daily" and "DoD" would otherwise be partial-day numbers.
    report_date = settings.report_date or (date.today() - timedelta(days=1))
    ctx = build_date_context(report_date)
    run_id = None

    # 1. Sync-health gate
    latest_post = _dwh_latest_post(settings, report_date)
    health = check_sync_health(
        latest_post, settings.now_utc, settings.sync_stall_hours, report_date
    )
    if health.is_stalled and not settings.force:
        msg = (
            f"Ops Flash ETL: live ERP stale — last GL 3010001 post {health.latest_post} "
            f"({health.lag_hours:.1f}h ago). Aborting. File an IT ticket for "
            f"fin.tblAccountingJournal."
        )
        log.error("dwh_stalled", **health.__dict__)
        send_alert(settings, "Ops Flash ETL — ERP stale", msg)
        return

    try:
        run_id = start_refresh_run(settings, report_date, latest_post)

        # 2. Pull + compute
        trend = _pull_trend(settings, ctx)
        all_targets = _pull_all_targets(settings)
        targets = targets_for_month(all_targets, report_date)
        snapshots, recon = _compute_for_date(settings, ctx, targets)

        # 3. Regression guards
        issues = run_regression_checks(snapshots, ctx)
        for issue in issues:
            log.warning("regression", issue=issue)

        # 4. Upsert
        # Targets are DB-resident (public.target, migration 00028) — read only,
        # no write per run.
        n_tgt = sum(len(v) for v in all_targets.values())
        n_snap = upsert_snapshots(settings, snapshots)
        n_trend = upsert_trend(settings, trend)
        n_hist = upsert_history(settings, trend)
        upsert_reconciliation(settings, recon)

        # 4b. SKU-level fact (Advanced Analysis) — non-critical; a failure here
        # must not fail the flash report itself.
        n_items = n_sku = 0
        try:
            n_items, n_sku = _upsert_sku(
                settings, *_pull_sku_sales(settings, ctx.month_start, ctx.month_end_excl)
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("sku upsert failed (non-critical)", error=str(exc))

        # 4c. Marketing spend (Marketing Analysis tab) — non-critical too.
        n_mkt = n_mkt_detail = n_mkt_monthly = 0
        n_mkt_camp = n_mkt_monthly_camp = 0
        try:
            mkt = _pull_marketing_spend(settings, ctx)
            n_mkt = upsert_marketing_spend(settings, mkt)
            detail = _pull_marketing_spend_detail(settings, ctx)
            n_mkt_detail = upsert_marketing_spend_detail(settings, detail)
            monthly = _pull_marketing_spend_monthly(settings, ctx)
            n_mkt_monthly = upsert_marketing_spend_monthly(settings, monthly)
            camp = _pull_marketing_spend_campaignable(settings, ctx)
            n_mkt_camp = upsert_marketing_spend_campaignable(settings, camp)
            camp_monthly = _pull_marketing_spend_monthly_campaignable(settings, ctx)
            n_mkt_monthly_camp = upsert_marketing_spend_monthly_campaignable(settings, camp_monthly)
        except Exception as exc:  # noqa: BLE001
            log.warning("marketing spend upsert failed (non-critical)", error=str(exc))

        # 4d. ROMI campaign refresh (ROMI Analysis layer) — non-critical.
        n_romi = n_romi_err = 0
        try:
            romi = refresh_romi(settings)
            n_romi = romi["updated"]
            n_romi_err = len(romi["errors"])
            for w in romi["warnings"]:
                log.warning("romi refresh warning", warning=w)
        except Exception as exc:  # noqa: BLE001
            log.warning("romi refresh failed (non-critical)", error=str(exc))

        finish_refresh_run(
            settings,
            run_id,
            "success",
            report_date,
            dwh_synced_at=latest_post,
            meta={
                "snapshots": n_snap,
                "trend": n_trend,
                "targets": n_tgt,
                "sku_items": n_items,
                "sku_sales": n_sku,
                "marketing_spend": n_mkt,
                "marketing_spend_detail": n_mkt_detail,
                "marketing_spend_monthly": n_mkt_monthly,
                "marketing_spend_campaignable": n_mkt_camp,
                "marketing_spend_monthly_campaignable": n_mkt_monthly_camp,
                "romi_campaigns": n_romi,
                "romi_errors": n_romi_err,
                "regressions": len(issues),
            },
        )
        log.info(
            "pipeline complete",
            report_date=str(report_date),
            snapshots=n_snap,
            trend=n_trend,
            history=n_hist,
            targets=n_tgt,
            sku_items=n_items,
            sku_sales=n_sku,
            marketing_spend=n_mkt,
            romi_campaigns=n_romi,
            regressions=len(issues),
        )
    except Exception as exc:  # noqa: BLE001 — must log + alert, never die silently
        log.exception("pipeline failed", report_date=str(report_date))
        if run_id:
            try:
                finish_refresh_run(
                    settings, run_id, "failed", report_date, error=str(exc)
                )
            except Exception:  # noqa: BLE001
                log.exception("could not record failure")
        send_alert(settings, "Ops Flash ETL — failed", f"{exc}")


def run_backfill(
    settings: Settings,
    from_date: date,
    to_date: date,
    limit: int | None = None,
) -> None:
    """Backfill daily_snapshot + reconciliation for every date in [from, to].

    The daily_trend table already holds the full FY series, but daily_snapshot
    (the full flash report: targets, achievement %, momentum, volume, recon) is
    only written for the current T-1 date on each scheduled run. This replays
    the pure compute (build_snapshots) across the historical window so the
    date picker can offer the full calendar.
    """
    latest_post = _dwh_latest_post(settings, to_date)
    health = check_sync_health(
        latest_post, settings.now_utc, settings.sync_stall_hours, to_date
    )
    if health.is_stalled and not settings.force:
        msg = (
            f"Ops Flash ETL backfill: live ERP stale — last GL 3010001 post {health.latest_post} "
            f"({health.lag_hours:.1f}h ago). Aborting. File an IT ticket for "
            f"fin.tblAccountingJournal."
        )
        log.error("dwh_stalled", **health.__dict__)
        send_alert(settings, "Ops Flash ETL — backfill ERP stale", msg)
        return

    dates = _date_range(from_date, to_date)
    if limit:
        dates = dates[-limit:]

    run_id = start_refresh_run(settings, to_date, latest_post)
    all_targets = _pull_all_targets(settings)
    done = 0
    failed: list[str] = []
    try:
        for rd in dates:
            ctx = build_date_context(rd)
            try:
                targets = targets_for_month(all_targets, rd)
                snapshots, recon = _compute_for_date(settings, ctx, targets)
                issues = run_regression_checks(snapshots, ctx)
                for issue in issues:
                    log.warning("regression", report_date=str(rd), issue=issue)
                upsert_snapshots(settings, snapshots)
                upsert_reconciliation(settings, recon)
                done += 1
            except Exception as exc:  # noqa: BLE001 — one bad date must not kill the batch
                failed.append(f"{rd}: {exc}")
                log.exception("backfill date failed", report_date=str(rd))

        finish_refresh_run(
            settings,
            run_id,
            "success",
            to_date,
            dwh_synced_at=latest_post,
            meta={
                "mode": "backfill",
                "from": str(from_date),
                "to": str(to_date),
                "backfilled": done,
                "failed": failed,
            },
        )
        log.info("backfill complete", backfilled=done, failed=len(failed))
    except Exception as exc:  # noqa: BLE001
        log.exception("backfill failed", from_date=str(from_date), to_date=str(to_date))
        finish_refresh_run(settings, run_id, "failed", to_date, error=str(exc))
        send_alert(settings, "Ops Flash ETL — backfill failed", f"{exc}")


def run_sku_backfill(settings: Settings, from_date: date, to_date: date) -> None:
    """Populate item_master + sku_sales_daily over a historical window.

    The daily run only writes the current month. Use this once to seed the
    trailing window that the Advanced Analysis trend/season/ABC modules need.
    """
    latest_post = _dwh_latest_post(settings, to_date)
    health = check_sync_health(
        latest_post, settings.now_utc, settings.sync_stall_hours, to_date
    )
    if health.is_stalled and not settings.force:
        msg = (
            f"Ops Flash ETL sku-backfill: live ERP stale — last GL 3010001 post {health.latest_post} "
            f"({health.lag_hours:.1f}h ago). Aborting."
        )
        log.error("dwh_stalled", **health.__dict__)
        send_alert(settings, "Ops Flash ETL — sku-backfill ERP stale", msg)
        return

    run_id = start_refresh_run(settings, to_date, latest_post)
    try:
        items, sku = _pull_sku_sales(settings, from_date, to_date)
        n_items = upsert_item_master(settings, items)
        n_sku = upsert_sku_sales(settings, sku)
        finish_refresh_run(
            settings,
            run_id,
            "success",
            to_date,
            dwh_synced_at=latest_post,
            meta={
                "mode": "sku_backfill",
                "from": str(from_date),
                "to": str(to_date),
                "items": n_items,
                "sku_sales": n_sku,
            },
        )
        log.info("sku backfill complete", items=n_items, sku_sales=n_sku)
    except Exception as exc:  # noqa: BLE001
        log.exception("sku backfill failed", from_date=str(from_date), to_date=str(to_date))
        finish_refresh_run(settings, run_id, "failed", to_date, error=str(exc))
        send_alert(settings, "Ops Flash ETL — sku-backfill failed", f"{exc}")


def run_history_backfill(settings: Settings, from_date: date, to_date: date) -> None:
    """Seed sbu_daily_history with 4 fiscal years of daily revenue per SBU.

    The daily run keeps the current FY fresh; this one-time backfill loads the
    4 prior FYs (plus the current FY-to-date) that the redesigned forecast
    section needs for its seasonal index and prior-year overlay.
    """
    latest_post = _dwh_latest_post(settings, to_date)
    health = check_sync_health(
        latest_post, settings.now_utc, settings.sync_stall_hours, to_date
    )
    if health.is_stalled and not settings.force:
        msg = (
            f"Ops Flash ETL history-backfill: live ERP stale — last GL 3010001 post "
            f"{health.latest_post} ({health.lag_hours:.1f}h ago). Aborting."
        )
        log.error("dwh_stalled", **health.__dict__)
        send_alert(settings, "Ops Flash ETL — history-backfill ERP stale", msg)
        return

    run_id = start_refresh_run(settings, to_date, latest_post)
    try:
        trend = _pull_history_window(settings, from_date, to_date)
        n_hist = upsert_history(settings, trend)
        finish_refresh_run(
            settings,
            run_id,
            "success",
            to_date,
            dwh_synced_at=latest_post,
            meta={
                "mode": "history_backfill",
                "from": str(from_date),
                "to": str(to_date),
                "history_rows": n_hist,
            },
        )
        log.info("history backfill complete", rows=n_hist)
    except Exception as exc:  # noqa: BLE001
        log.exception("history backfill failed", from_date=str(from_date), to_date=str(to_date))
        finish_refresh_run(settings, run_id, "failed", to_date, error=str(exc))
        send_alert(settings, "Ops Flash ETL — history-backfill failed", f"{exc}")


def run_marketing_backfill(settings: Settings, from_date: date, to_date: date) -> None:
    """Seed marketing_spend over a historical window.

    The daily run only writes T-1, but the Marketing Analysis tab follows the
    date picker, so it needs one row per (sbu, report_date) across the FY.
    """
    latest_post = _dwh_latest_post(settings, to_date)
    health = check_sync_health(
        latest_post, settings.now_utc, settings.sync_stall_hours, to_date
    )
    if health.is_stalled and not settings.force:
        msg = (
            f"Ops Flash ETL marketing-backfill: live ERP stale — last GL 3010001 post "
            f"{health.latest_post} ({health.lag_hours:.1f}h ago). Aborting."
        )
        log.error("dwh_stalled", **health.__dict__)
        send_alert(settings, "Ops Flash ETL — marketing-backfill ERP stale", msg)
        return

    run_id = start_refresh_run(settings, to_date, latest_post)
    done = 0
    failed: list[str] = []
    try:
        for rd in _date_range(from_date, to_date):
            ctx = build_date_context(rd)
            try:
                rows = _pull_marketing_spend(settings, ctx)
                upsert_marketing_spend(settings, rows)
                detail = _pull_marketing_spend_detail(settings, ctx)
                upsert_marketing_spend_detail(settings, detail)
                camp = _pull_marketing_spend_campaignable(settings, ctx)
                upsert_marketing_spend_campaignable(settings, camp)
                done += 1
            except Exception as exc:  # noqa: BLE001
                failed.append(f"{rd}: {exc}")
                log.exception("marketing backfill date failed", report_date=str(rd))

        # Monthly spend series is a single trailing-window pull (not per-day):
        # it only needs to run once at the end of the backfill.
        ctx = build_date_context(to_date)
        monthly = _pull_marketing_spend_monthly(settings, ctx)
        upsert_marketing_spend_monthly(settings, monthly)
        camp_monthly = _pull_marketing_spend_monthly_campaignable(settings, ctx)
        upsert_marketing_spend_monthly_campaignable(settings, camp_monthly)

        finish_refresh_run(
            settings,
            run_id,
            "success",
            to_date,
            dwh_synced_at=latest_post,
            meta={
                "mode": "marketing_backfill",
                "from": str(from_date),
                "to": str(to_date),
                "days": done,
                "failed": failed,
            },
        )
        log.info("marketing backfill complete", days=done, failed=len(failed))
    except Exception as exc:  # noqa: BLE001
        log.exception("marketing backfill failed", from_date=str(from_date), to_date=str(to_date))
        finish_refresh_run(settings, run_id, "failed", to_date, error=str(exc))
        send_alert(settings, "Ops Flash ETL — marketing-backfill failed", f"{exc}")


def run_romi_refresh(settings: Settings) -> None:
    """Refresh all ROMI campaign computed columns from the DWH.

    Takes over the "Automated ROMI for all SBU" project's refresh.py: the flash
    ETL now owns recomputation of romi_campaign. Only computed columns are
    written; *_ov overrides are never touched.
    """
    latest_post = _dwh_latest_post(settings, date.today() - timedelta(days=1))
    health = check_sync_health(
        latest_post, settings.now_utc, settings.sync_stall_hours, date.today()
    )
    if health.is_stalled and not settings.force:
        msg = (
            f"Ops Flash ETL romi-refresh: live ERP stale — last GL 3010001 post "
            f"{health.latest_post} ({health.lag_hours:.1f}h ago). Aborting."
        )
        log.error("dwh_stalled", **health.__dict__)
        send_alert(settings, "Ops Flash ETL — romi-refresh ERP stale", msg)
        return

    run_id = start_refresh_run(settings, date.today(), latest_post)
    try:
        result = refresh_romi(settings)
        for w in result["warnings"]:
            log.warning("romi refresh warning", warning=w)
        for e in result["errors"]:
            log.warning("romi refresh campaign failed", error=e)
        finish_refresh_run(
            settings,
            run_id,
            "success",
            date.today(),
            dwh_synced_at=latest_post,
            meta={"mode": "romi_refresh", **result},
        )
        log.info(
            "romi refresh complete",
            total=result["total"],
            updated=result["updated"],
            errors=len(result["errors"]),
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("romi refresh failed")
        finish_refresh_run(settings, run_id, "failed", date.today(), error=str(exc))
        send_alert(settings, "Ops Flash ETL — romi-refresh failed", f"{exc}")


def run_partner_feed_refresh(settings: Settings, from_date: date, to_date: date) -> None:
    """Pull Partner feed (demo retail) POS sales + net P&L into Supabase.

    Independent of the DWH (the portal is near-real-time and has its own
    freshness), so there is no DWH sync-health gate. Writes four tables:
    partner_feed_office, partner_feed_daily_total, partner_feed_daily_sales and
    partner_feed_office_pl. Non-critical: a portal outage must not fail the flash
    report.
    """
    run_id = start_refresh_run(settings, to_date, None)
    try:
        from . import partner_feed

        offices, pl = partner_feed.fetch_office_pl(settings, from_date, to_date)
        totals, sales = partner_feed.fetch_daily_sales(settings, from_date, to_date)

        n_offices = upsert_partner_feed_offices(settings, offices)
        n_totals = upsert_partner_feed_daily_total(settings, totals)
        n_sales = upsert_partner_feed_daily_sales(settings, sales)
        n_pl = upsert_partner_feed_office_pl(settings, pl)

        finish_refresh_run(
            settings,
            run_id,
            "success",
            to_date,
            meta={
                "mode": "partner_feed_refresh",
                "from": str(from_date),
                "to": str(to_date),
                "offices": n_offices,
                "daily_total": n_totals,
                "daily_sales": n_sales,
                "office_pl": n_pl,
            },
        )
        log.info(
            "partner_feed refresh complete",
            offices=n_offices,
            daily_total=n_totals,
            daily_sales=n_sales,
            office_pl=n_pl,
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("partner_feed refresh failed")
        finish_refresh_run(settings, run_id, "failed", to_date, error=str(exc))
        send_alert(settings, "Ops Flash ETL — partner_feed-refresh failed", f"{exc}")


def _compute_for_date(
    settings: Settings,
    ctx: DateContext,
    targets: dict[tuple[int, str], Target],
) -> tuple[list[Snapshot], Reconciliation]:
    """Pure pull + compute for a single report date (no writes)."""
    revenue = _pull_revenue(settings, ctx)
    recon = _pull_reconciliation(settings, ctx)
    nxab_split = _pull_nxab_split(settings, ctx)
    volume = _pull_volume(settings, ctx)
    snapshots = build_snapshots(revenue, volume, targets, nxab_split, ctx)
    return snapshots, recon


def _date_range(start: date, end: date) -> list[date]:
    """Inclusive list of calendar days from start to end."""
    out: list[date] = []
    cur = start
    while cur <= end:
        out.append(cur)
        cur += timedelta(days=1)
    return out


# ---------------------------------------------------------------------------
# Pull helpers
# ---------------------------------------------------------------------------

def _dwh_latest_post(settings: Settings, report_date: date) -> datetime | None:
    window = report_date - timedelta(days=7)
    rows = dwh_query(settings, SYNC_HEALTH_SQL, (GL_SALES_LOCAL, window))
    if not rows or rows[0]["latest_post"] is None:
        return None
    lp = rows[0]["latest_post"]
    if lp.tzinfo is None:
        lp = lp.replace(tzinfo=DHAKA)
    return lp.astimezone(UTC)


def _pull_revenue(settings: Settings, ctx) -> dict[int, SbuRevenue]:
    params = (
        ctx.report_date, ctx.dod,
        ctx.month_start, ctx.month_end_excl,
        ctx.prev_month_start, ctx.prev_month_end_excl,
        ctx.yoy_start, ctx.yoy_end_excl,
        ctx.fy_start, ctx.month_end_excl,
        ctx.cy_start, ctx.month_end_excl,
        *GL_REVENUE,
    )
    rows = dwh_query(settings, REVENUE_SQL, params)
    return {
        int(r["sbu"]): SbuRevenue(
            sbu=int(r["sbu"]),
            daily=float(r["daily"] or 0),
            dod=float(r["dod"] or 0),
            mtd=float(r["mtd"] or 0),
            mom=float(r["mom"] or 0),
            yoy=float(r["yoy"] or 0),
            fy_ytd=float(r["fy_ytd"] or 0),
            cy_ytd=float(r["cy_ytd"] or 0),
        )
        for r in rows
    }


def _pull_reconciliation(settings: Settings, ctx) -> Reconciliation:
    rows = dwh_query(settings, RECON_SQL, (ctx.month_start, ctx.month_end_excl))
    r = rows[0] if rows else {}
    g1all = float(r.get("g1all") or 0)
    excl = float(r.get("excl") or 0)
    g2all = float(r.get("g2all") or 0)
    g5all = float(r.get("g5all") or 0)
    g6all = float(r.get("g6all") or 0)
    g4all = float(r.get("g4all") or 0)
    rpt_gl1 = float(r.get("rpt_gl1") or 0)
    rpt_frt = float(r.get("rpt_frt") or 0)
    rpt_tot = round(rpt_gl1 + rpt_frt, 6)
    full_tot = round(g1all + g2all + g5all + g6all + g4all, 6)
    gap = round(full_tot - rpt_tot, 6)
    return Reconciliation(
        report_date=ctx.report_date,
        g1all=g1all, excl=excl, g2all=g2all, g5all=g5all, g6all=g6all, g4all=g4all,
        rpt_gl1=rpt_gl1, rpt_frt=rpt_frt, rpt_tot=rpt_tot, full_tot=full_tot, gap=gap,
    )


def _pull_nxab_split(settings: Settings, ctx) -> tuple[float, float]:
    rows = dwh_query(settings, NXAB_SPLIT_SQL, (ctx.month_start, ctx.month_end_excl))
    if not rows:
        return (0.0, 0.0)
    return split_nxab(float(rows[0]["asphalt"] or 0), float(rows[0]["lubex"] or 0))


def _pull_volume(settings: Settings, ctx) -> dict[int, SbuVolume]:
    try:
        rows = dwh_query(
            settings, VOLUME_SQL, (ctx.report_date, ctx.month_start, ctx.month_end_excl)
        )
    except Exception as exc:  # noqa: BLE001 — volume is non-critical; revenue is source of truth
        log.warning("volume query failed (non-critical)", error=str(exc))
        return {}

    # One row per (sbu, uom); keep the UOM with the largest MTD quantity.
    best: dict[int, dict] = {}
    for r in rows:
        sbu = int(r["sbu"])
        mtd = float(r["mtd"] or 0)
        cur = best.get(sbu)
        if cur is None or mtd > cur["mtd"]:
            best[sbu] = {
                "daily": float(r["daily"] or 0),
                "mtd": mtd,
                "uom": (r["uom"] or "").strip(),
            }
    return {
        sbu: SbuVolume(
            sbu=sbu,
            daily=v["daily"],
            mtd=v["mtd"],
            uom=v["uom"],
            has_vol=True,
        )
        for sbu, v in best.items()
    }


def _pull_trend(settings: Settings, ctx) -> list[TrendPoint]:
    params = (*GL_REVENUE, ctx.fy_start, ctx.month_end_excl)
    rows = dwh_query(settings, TREND_SQL, params)
    return [
        TrendPoint(
            sbu_id=int(r["sbu"]),
            d=r["d"],
            channel="default",
            value=float(r["value"] or 0),
        )
        for r in rows
    ]


def _pull_history_window(settings: Settings, from_date: date, to_date: date) -> list[TrendPoint]:
    rows = dwh_query(settings, HISTORY_SQL, (*GL_REVENUE, from_date, to_date))
    return [
        TrendPoint(
            sbu_id=int(r["sbu"]),
            d=r["d"],
            channel="default",
            value=float(r["value"] or 0),
        )
        for r in rows
    ]


def _pull_all_targets(settings: Settings) -> dict[date, dict[tuple[int, str], Target]]:
    return fetch_all_targets(settings)


def _pull_sku_sales(
    settings: Settings,
    from_date: date,
    to_date: date,
) -> tuple[list[ItemMaster], list[SkuSale]]:
    """Item x day quantity + SBU-reconciled revenue allocation (Advanced)."""
    # Revenue by (sbu, day) over the same window — reuses the flash report's
    # net-of-returns GL definition so SKU values reconcile to the SBU total.
    revenue_rows = dwh_query(settings, TREND_SQL, (*GL_REVENUE, from_date, to_date))
    revenue = {(int(r["sbu"]), r["d"]): float(r["value"] or 0) for r in revenue_rows}

    quantity_rows = dwh_query(settings, SKU_QUANTITY_SQL, (from_date, to_date))
    sku_sales = build_sku_sales(quantity_rows, revenue)

    # Item master (readable names/categories) — best-effort; fall back to
    # item_id-only rows so the FK from sku_sales_daily stays valid.
    items: dict[int, ItemMaster] = {
        s.item_id: ItemMaster(item_id=s.item_id) for s in sku_sales
    }
    try:
        item_ids = list(items.keys())
        for start in range(0, len(item_ids), 500):
            chunk = item_ids[start : start + 500]
            for r in dwh_query(settings, item_master_sql(chunk)):
                iid = int(r["item_id"])
                if iid not in items:
                    continue  # only enrich items that actually appear in sales
                items[iid] = ItemMaster(
                    item_id=iid,
                    item_code=(r["item_code"] or None),
                    item_name=(r["item_name"] or None),
                    category_id=(int(r["category_id"]) if r["category_id"] is not None else None),
                    category_name=(r["category_name"] or None),
                )
    except Exception as exc:  # noqa: BLE001 — names are best-effort
        log.warning("item master query failed (non-critical)", error=str(exc))

    return list(items.values()), sku_sales


def _upsert_sku(
    settings: Settings,
    items: list[ItemMaster],
    sku_sales: list[SkuSale],
) -> tuple[int, int]:
    n_items = upsert_item_master(settings, items)
    n_sku = upsert_sku_sales(settings, sku_sales)
    return n_items, n_sku


def _pull_marketing_spend(settings: Settings, ctx: DateContext) -> list[MarketingSpend]:
    params = (
        ctx.month_start, ctx.month_end_excl,
        ctx.prev_month_start, ctx.prev_month_end_excl,
        ctx.yoy_start, ctx.yoy_end_excl,
        ctx.fy_start, ctx.month_end_excl,
    )
    rows = dwh_query(settings, MARKETING_SPEND_SQL, params)
    return [
        MarketingSpend(
            sbu_id=int(r["sbu"]),
            report_date=ctx.report_date,
            mtd=float(r["mtd"] or 0),
            mom=float(r["mom"] or 0),
            yoy=float(r["yoy"] or 0),
            fy_ytd=float(r["fy_ytd"] or 0),
        )
        for r in rows
    ]


def _pull_marketing_spend_detail(
    settings: Settings, ctx: DateContext
) -> list[MarketingSpendDetail]:
    rows = dwh_query(
        settings, MARKETING_SPEND_DETAIL_SQL, (ctx.month_start, ctx.month_end_excl)
    )
    return [
        MarketingSpendDetail(
            sbu_id=int(r["sbu"]),
            report_date=ctx.report_date,
            subgl_code=(r["subgl_code"] or ""),
            subgl_name=(r["subgl_name"] or "Unclassified"),
            mtd=float(r["mtd"] or 0),
        )
        for r in rows
    ]


def _pull_marketing_spend_monthly(
    settings: Settings, ctx: DateContext
) -> list[MarketingSpendMonthly]:
    # Trailing 24-month window for a meaningful trend line (the chart explains
    # the "Spend MoM" column). Window ends at the report month (exclusive).
    from_month = date(ctx.month_start.year, ctx.month_start.month, 1)
    from_date = date(from_month.year - 2, from_month.month, 1)
    rows = dwh_query(
        settings, MARKETING_SPEND_MONTHLY_SQL, (from_date, ctx.month_end_excl)
    )
    return [
        MarketingSpendMonthly(
            sbu_id=int(r["sbu"]),
            period_month=r["period_month"],
            spend=float(r["spend"] or 0),
        )
        for r in rows
    ]


def _pull_marketing_spend_campaignable(
    settings: Settings, ctx: DateContext
) -> list[MarketingSpend]:
    params = (
        ctx.month_start, ctx.month_end_excl,
        ctx.prev_month_start, ctx.prev_month_end_excl,
        ctx.yoy_start, ctx.yoy_end_excl,
        ctx.fy_start, ctx.month_end_excl,
    )
    rows = dwh_query(settings, MARKETING_SPEND_CAMPAIGNABLE_SQL, params)
    return [
        MarketingSpend(
            sbu_id=int(r["sbu"]),
            report_date=ctx.report_date,
            mtd=float(r["mtd"] or 0),
            mom=float(r["mom"] or 0),
            yoy=float(r["yoy"] or 0),
            fy_ytd=float(r["fy_ytd"] or 0),
        )
        for r in rows
    ]


def _pull_marketing_spend_monthly_campaignable(
    settings: Settings, ctx: DateContext
) -> list[MarketingSpendMonthly]:
    from_month = date(ctx.month_start.year, ctx.month_start.month, 1)
    from_date = date(from_month.year - 2, from_month.month, 1)
    rows = dwh_query(
        settings, MARKETING_SPEND_MONTHLY_CAMPAIGNABLE_SQL, (from_date, ctx.month_end_excl)
    )
    return [
        MarketingSpendMonthly(
            sbu_id=int(r["sbu"]),
            period_month=r["period_month"],
            spend=float(r["spend"] or 0),
        )
        for r in rows
    ]
