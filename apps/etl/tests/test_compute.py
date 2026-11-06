from datetime import date

from flash_etl.compute import build_snapshots, momentum_signal, pct_change, split_nxab
from flash_etl.dates import build_date_context
from flash_etl.models import SbuRevenue, SbuVolume, Target


def test_momentum_thresholds():
    assert momentum_signal(None) == "N/A"
    assert momentum_signal(25.0) == "Strong +"
    assert momentum_signal(20.0) == "Strong +"
    assert momentum_signal(5.0) == "Positive"
    assert momentum_signal(0.0) == "Positive"
    assert momentum_signal(-1.0) == "Neutral"
    assert momentum_signal(-15.0) == "Neutral"
    assert momentum_signal(-20.0) == "Weak"
    assert momentum_signal(-30.0) == "Weak"
    assert momentum_signal(-31.0) == "Negative"


def test_pct_change():
    assert abs(pct_change(120, 100) - 20.0) < 1e-9
    assert abs(pct_change(90, 100) + 10.0) < 1e-9
    assert pct_change(None, 100) is None
    assert pct_change(100, 0) is None
    assert pct_change(100, None) is None


def test_split_nxab():
    assert split_nxab(0, 0) == (0.0, 0.0)
    a, b = split_nxab(28.48, 71.52)
    assert round(a + b, 6) == 1.0
    assert round(a, 4) == round(28.48 / 100, 4)


def test_build_snapshots_remaps_nxab_to_two_channels():
    ctx = build_date_context(date(2026, 9, 2))
    revenue = {
        58: SbuRevenue(sbu=58, daily=3.3, mtd=5.87, mom=4.87, fy_ytd=310, cy_ytd=1293),
        98: SbuRevenue(sbu=98, daily=0.1, mtd=0.19, mom=0.51, fy_ytd=12, cy_ytd=91),
    }
    volume = {58: SbuVolume(sbu=58, mtd=104794, uom="Bag", has_vol=True)}
    targets = {
        (58, "default"): Target(mo_rev=173.0, mo_vol=170000),
        (98, "asphalt"): Target(mo_rev=8.99),
        (98, "lubex"): Target(mo_rev=2.61),
    }
    snaps = build_snapshots(revenue, volume, targets, (0.2848, 0.7152), ctx)

    codes = {(s.sbu_id, s.channel) for s in snaps}
    assert (98, "asphalt") in codes
    assert (98, "lubex") in codes
    assert (58, "default") in codes

    accel = next(s for s in snaps if s.sbu_id == 58)
    assert accel.vol_uom == "Bag"
    assert accel.mo_tgt_vol == 170000.0


def test_mtd_target_uses_days_elapsed():
    ctx = build_date_context(date(2026, 9, 2))  # day 2 of 30
    revenue = {36: SbuRevenue(sbu=36, daily=5, mtd=10.5, mom=12.3, fy_ytd=428, cy_ytd=1857)}
    snaps = build_snapshots(revenue, {}, {(36, "default"): Target(mo_rev=180.0)}, (0.0, 0.0), ctx)
    s = next(x for x in snaps if x.sbu_id == 36)
    expected = round(180.0 * (2 / 30), 6)
    assert s.mtd_tgt_rev == expected
    assert s.mtd_ach_pct is not None


def test_no_sbu_zero_survives():
    ctx = build_date_context(date(2026, 9, 2))
    # SBU 0 should never appear as a snapshot id; remap happens in SQL.
    revenue = {58: SbuRevenue(sbu=58, mtd=5.87)}
    snaps = build_snapshots(revenue, {}, {}, (0.0, 0.0), ctx)
    assert all(s.sbu_id != 0 for s in snaps)
