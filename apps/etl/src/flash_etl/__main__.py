"""CLI entry point: `python -m flash_etl` or `flash-etl`."""

from __future__ import annotations

import argparse
from datetime import date, timedelta

import structlog

from .config import get_settings
from .dates import fiscal_year_start
from .pipeline import (
    run,
    run_backfill,
    run_history_backfill,
    run_partner_feed_refresh,
    run_marketing_backfill,
    run_romi_refresh,
    run_sku_backfill,
)


def main() -> None:
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ]
    )
    parser = argparse.ArgumentParser(description="Ops Flash Report ETL")
    parser.add_argument("--report-date", type=str, default=None, help="YYYY-MM-DD (default: today)")
    parser.add_argument("--force", action="store_true", help="run even if DWH sync looks stalled")
    parser.add_argument(
        "--backfill", action="store_true",
        help="backfill daily_snapshot/reconciliation for a date range",
    )
    parser.add_argument(
        "--backfill-from", type=str, default=None, help="YYYY-MM-DD (default: FY start Jul 1)"
    )
    parser.add_argument(
        "--backfill-to", type=str, default=None, help="YYYY-MM-DD (default: T-1)"
    )
    parser.add_argument(
        "--backfill-limit", type=int, default=None, help="process only the last N dates"
    )
    parser.add_argument(
        "--sku-backfill", action="store_true",
        help="populate item_master + sku_sales_daily (Advanced Analysis) for a range",
    )
    parser.add_argument(
        "--sku-backfill-from", type=str, default=None,
        help="YYYY-MM-DD (default: 24 months before backfill-to)",
    )
    parser.add_argument(
        "--sku-backfill-to", type=str, default=None, help="YYYY-MM-DD (default: T-1)"
    )
    parser.add_argument(
        "--history-backfill", action="store_true",
        help="populate sbu_daily_history (4-FY forecast history)",
    )
    parser.add_argument(
        "--history-backfill-from", type=str, default=None,
        help="YYYY-MM-DD (default: 4 fiscal years before history-backfill-to)",
    )
    parser.add_argument(
        "--history-backfill-to", type=str, default=None, help="YYYY-MM-DD (default: T-1)"
    )
    parser.add_argument(
        "--marketing-backfill", action="store_true",
        help="populate marketing_spend (Marketing Analysis tab) for a range",
    )
    parser.add_argument(
        "--marketing-backfill-from", type=str, default=None,
        help="YYYY-MM-DD (default: FY start Jul 1)",
    )
    parser.add_argument(
        "--marketing-backfill-to", type=str, default=None, help="YYYY-MM-DD (default: T-1)"
    )
    parser.add_argument(
        "--romi-refresh", action="store_true",
        help="recompute romi_campaign computed columns from the DWH",
    )
    parser.add_argument(
        "--partner_feed-refresh", action="store_true",
        help="pull Partner feed (demo retail) POS sales + net P&L into Supabase",
    )
    parser.add_argument(
        "--partner_feed-from", type=str, default=None,
        help="YYYY-MM-DD (default: first of current month)",
    )
    parser.add_argument(
        "--partner_feed-to", type=str, default=None, help="YYYY-MM-DD (default: T-1)"
    )
    args = parser.parse_args()

    settings = get_settings()
    if args.force:
        settings.force = True

    if args.sku_backfill:
        today = date.today()
        to_date = (
            date.fromisoformat(args.sku_backfill_to)
            if args.sku_backfill_to
            else (today - timedelta(days=1))
        )
        from_date = (
            date.fromisoformat(args.sku_backfill_from)
            if args.sku_backfill_from
            else (to_date - timedelta(days=730))
        )
        run_sku_backfill(settings, from_date, to_date)
        return

    if args.history_backfill:
        today = date.today()
        to_date = (
            date.fromisoformat(args.history_backfill_to)
            if args.history_backfill_to
            else (today - timedelta(days=1))
        )
        fy_start = fiscal_year_start(to_date)
        from_date = (
            date.fromisoformat(args.history_backfill_from)
            if args.history_backfill_from
            else date(fy_start.year - 4, 7, 1)
        )
        run_history_backfill(settings, from_date, to_date)
        return

    if args.marketing_backfill:
        today = date.today()
        to_date = (
            date.fromisoformat(args.marketing_backfill_to)
            if args.marketing_backfill_to
            else (today - timedelta(days=1))
        )
        from_date = (
            date.fromisoformat(args.marketing_backfill_from)
            if args.marketing_backfill_from
            else fiscal_year_start(to_date)
        )
        run_marketing_backfill(settings, from_date, to_date)
        return

    if args.romi_refresh:
        run_romi_refresh(settings)
        return

    if args.partner_feed_refresh:
        today = date.today()
        to_date = (
            date.fromisoformat(args.partner_feed_to)
            if args.partner_feed_to
            else (today - timedelta(days=1))
        )
        from_date = (
            date.fromisoformat(args.partner_feed_from)
            if args.partner_feed_from
            else to_date.replace(day=1)
        )
        run_partner_feed_refresh(settings, from_date, to_date)
        return

    if args.backfill:
        today = date.today()
        to_date = (
            date.fromisoformat(args.backfill_to)
            if args.backfill_to
            else (today - timedelta(days=1))
        )
        from_date = (
            date.fromisoformat(args.backfill_from)
            if args.backfill_from
            else fiscal_year_start(to_date)
        )
        run_backfill(settings, from_date, to_date, limit=args.backfill_limit)
        return

    if args.report_date:
        settings.report_date = date.fromisoformat(args.report_date)

    run(settings)


if __name__ == "__main__":
    main()
