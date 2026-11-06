"""Pure metric computation — fully unit-testable, no I/O.

This is where the LOCKED business logic lives: net revenue, momentum
thresholds, achievement %, channel split, and the regression guards that
prevent the "permanently-fixed bugs" from re-introducing.
"""

from __future__ import annotations

from datetime import date

from .constants import NXAB_ID, SORTED_SBU_IDS
from .dates import DateContext
from .models import SbuRevenue, SbuVolume, SkuSale, Snapshot, Target, TrendPoint

# Momentum thresholds (protocol.md)
_MOM_STRONG = 20.0
_MOM_POSITIVE = 0.0
_MOM_NEUTRAL = -15.0
_MOM_WEAK = -30.0


def pct_change(current: float | None, prev: float | None) -> float | None:
    """(current/prev - 1)*100, or None when prev is missing/zero."""
    if prev is None or current is None:
        return None
    if prev == 0:
        return None
    return (current / prev - 1) * 100


def momentum_signal(mom_pct: float | None) -> str:
    if mom_pct is None:
        return "N/A"
    if mom_pct >= _MOM_STRONG:
        return "Strong +"
    if mom_pct >= _MOM_POSITIVE:
        return "Positive"
    if mom_pct >= _MOM_NEUTRAL:
        return "Neutral"
    if mom_pct >= _MOM_WEAK:
        return "Weak"
    return "Negative"


def _round(v: float | None, nd: int = 6) -> float | None:
    return round(v, nd) if v is not None else None


def build_snapshots(
    revenue: dict[int, SbuRevenue],
    volume: dict[int, SbuVolume],
    targets: dict[tuple[int, str], Target],  # (sbu_id, channel) -> monthly target
    nxab_split: tuple[float, float],  # (asphalt_ratio, lubex_ratio)
    ctx: DateContext,
) -> list[Snapshot]:
    """Assemble computed Snapshot rows for every report SBU (NXAB -> two channels)."""
    snapshots: list[Snapshot] = []
    asphalt_ratio, lubex_ratio = nxab_split

    for sbu_id in SORTED_SBU_IDS:
        rev = revenue.get(sbu_id) or SbuRevenue(sbu=sbu_id)
        vol = volume.get(sbu_id) or SbuVolume(sbu=sbu_id)

        if sbu_id == NXAB_ID:
            snapshots.append(
                _build_channel_snapshot(
                    sbu_id, "asphalt", rev, asphalt_ratio, targets, ctx
                )
            )
            snapshots.append(
                _build_channel_snapshot(
                    sbu_id, "lubex", rev, lubex_ratio, targets, ctx
                )
            )
        else:
            snapshots.append(_build_snapshot(sbu_id, "default", rev, vol, targets, ctx))

    return snapshots


def _build_snapshot(
    sbu_id: int,
    channel: str,
    rev: SbuRevenue,
    vol: SbuVolume,
    targets: dict[tuple[int, str], Target],
    ctx: DateContext,
) -> Snapshot:
    tgt = targets.get((sbu_id, channel))
    mo_tgt_rev = tgt.mo_rev if tgt else None
    mo_tgt_vol = tgt.mo_vol if tgt else None
    mtd_tgt_rev = round(mo_tgt_rev * ctx.month_factor, 6) if mo_tgt_rev is not None else None
    mtd_tgt_vol = round(mo_tgt_vol * ctx.month_factor, 6) if mo_tgt_vol is not None else None

    ach = None
    if mtd_tgt_rev is not None and rev.mtd > 0 and mtd_tgt_rev > 0:
        ach = round(rev.mtd / mtd_tgt_rev * 100, 4)

    mom_pct = _round(pct_change(rev.mtd, rev.mom))
    yoy_pct = _round(pct_change(rev.mtd, rev.yoy))
    proj = round(rev.mtd / ctx.days_elapsed * ctx.days_in_month, 6) if rev.mtd > 0 else 0.0
    has_vol = vol.has_vol or (vol.mtd or 0) > 0

    return Snapshot(
        sbu_id=sbu_id,
        report_date=ctx.report_date,
        channel=channel,
        daily_rev=_round(rev.daily) or 0.0,
        dod_rev=_round(rev.dod) or 0.0,
        mtd_rev=_round(rev.mtd) or 0.0,
        mom_rev=_round(rev.mom) or 0.0,
        yoy_rev=_round(rev.yoy) or 0.0,
        fy_ytd_rev=_round(rev.fy_ytd) or 0.0,
        cy_ytd_rev=_round(rev.cy_ytd) or 0.0,
        daily_vol=_round(vol.daily, 3),
        mtd_vol=_round(vol.mtd, 3),
        mom_vol=_round(vol.mom, 3),
        vol_uom=vol.uom or None,
        has_vol=has_vol,
        mo_tgt_rev=_round(mo_tgt_rev),
        mtd_tgt_rev=_round(mtd_tgt_rev),
        mo_tgt_vol=_round(mo_tgt_vol, 3),
        mtd_tgt_vol=_round(mtd_tgt_vol, 3),
        mtd_ach_pct=ach,
        mom_pct=mom_pct,
        yoy_pct=yoy_pct,
        proj_rev=proj,
        momentum=momentum_signal(mom_pct),
    )


def _build_channel_snapshot(
    sbu_id: int,
    channel: str,
    rev: SbuRevenue,
    ratio: float,
    targets: dict[tuple[int, str], Target],
    ctx: DateContext,
) -> Snapshot:
    """NXAB channel row: revenue scaled by channel ratio, own target."""
    scaled = SbuRevenue(
        sbu=sbu_id,
        daily=rev.daily * ratio,
        dod=rev.dod * ratio,
        mtd=rev.mtd * ratio,
        mom=rev.mom * ratio,
        yoy=rev.yoy * ratio,
        fy_ytd=rev.fy_ytd * ratio,
        cy_ytd=rev.cy_ytd * ratio,
    )
    empty_vol = SbuVolume(sbu=sbu_id)
    return _build_snapshot(sbu_id, channel, scaled, empty_vol, targets, ctx)


def build_trend(revenue: dict[int, SbuRevenue], ctx: DateContext) -> list[TrendPoint]:
    """(Placeholder for trend assembly — trend is populated directly from TREND_SQL.)"""
    return []


def split_nxab(asphalt: float, lubex: float) -> tuple[float, float]:
    total = asphalt + lubex
    if total <= 0:
        return (0.0, 0.0)
    return (asphalt / total, lubex / total)


def build_sku_sales(
    quantity_rows: list[dict],
    revenue: dict[tuple[int, date], float],
) -> list[SkuSale]:
    """Allocate SBU x day GL revenue to items proportionally to delivered qty.

    quantity_rows: dicts with sbu (int), item_id (int), uom (str), d (date),
    quantity (float). revenue: (sbu, d) -> Cr. The allocation re-uses the same
    net-of-returns revenue definition as the flash report, so SKU values
    reconcile to the SBU daily total.

    The fact table is keyed (sbu, channel, item, day) with a single UOM, so an
    item delivered in multiple UOMs on the same day is collapsed to one row
    (quantities and allocated value summed; the dominant-quantity UOM wins).
    """
    totals: dict[tuple[int, date], float] = {}
    for q in quantity_rows:
        key = (q["sbu"], q["d"])
        totals[key] = totals.get(key, 0.0) + float(q["quantity"] or 0)

    agg: dict[tuple[int, int, date], dict] = {}
    for q in quantity_rows:
        sbu = int(q["sbu"])
        item_id = int(q["item_id"])
        d = q["d"]
        qty = float(q["quantity"] or 0)
        tq = totals.get((sbu, d), 0.0)
        rev = revenue.get((sbu, d), 0.0)
        value = (qty / tq * rev) if tq > 0 else 0.0
        uom = (q["uom"] or "").strip()

        a = agg.get((sbu, item_id, d))
        if a is None:
            agg[(sbu, item_id, d)] = {"qty": qty, "value": value, "uom": uom, "uom_qty": qty}
        else:
            a["qty"] += qty
            a["value"] += value
            if qty > a["uom_qty"]:
                a["uom"] = uom
                a["uom_qty"] = qty

    return [
        SkuSale(
            sbu_id=sbu,
            item_id=item_id,
            d=d,
            quantity=round(a["qty"], 3),
            uom=a["uom"],
            value=round(a["value"], 6),
        )
        for (sbu, item_id, d), a in agg.items()
    ]
