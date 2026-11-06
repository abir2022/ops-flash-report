from datetime import UTC, date, datetime, timedelta

from flash_etl.dates import build_date_context
from flash_etl.models import Snapshot
from flash_etl.validate import check_sync_health, run_regression_checks


def test_sync_health_stalled():
    now = datetime(2026, 9, 3, 8, 0, tzinfo=UTC)
    stale = now - timedelta(hours=15)
    health = check_sync_health(stale, now, stall_hours=12.0, report_date=date(2026, 9, 2))
    assert health.is_stalled is True


def test_sync_health_ok():
    now = datetime(2026, 9, 3, 8, 0, tzinfo=UTC)
    fresh = now - timedelta(hours=2)
    health = check_sync_health(fresh, now, stall_hours=12.0, report_date=date(2026, 9, 2))
    assert health.is_stalled is False


def test_regression_flags_sbu_zero():
    ctx = build_date_context(date(2026, 9, 2))
    snaps = [Snapshot(sbu_id=0, report_date=ctx.report_date, mtd_rev=1.0)]
    issues = run_regression_checks(snaps, ctx)
    assert any("SBU-0" in i for i in issues)


def test_regression_flags_recon_leak():
    ctx = build_date_context(date(2026, 9, 2))
    snaps = [Snapshot(sbu_id=103, report_date=ctx.report_date, mtd_rev=1.0)]
    issues = run_regression_checks(snaps, ctx)
    assert any("Recon-only" in i for i in issues)


def test_regression_flags_invalid_momentum():
    ctx = build_date_context(date(2026, 9, 2))
    snaps = [Snapshot(sbu_id=36, report_date=ctx.report_date, momentum="Bogus")]
    issues = run_regression_checks(snaps, ctx)
    assert any("invalid momentum" in i for i in issues)
