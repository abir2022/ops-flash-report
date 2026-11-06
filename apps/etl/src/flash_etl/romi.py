"""ROMI compute engine — a faithful port of the "Automated ROMI for all SBU"
project's engine.py / refresh.py, adapted to run inside the flash-report ETL.

Recomputes the ROMI base metrics (F / G / G_SPLY / H / J / O_M) for every
campaign from the DWH and writes them back to public.romi_campaign. Only the
computed columns are rewritten; the *_ov override columns are never touched
(mirrors the ROMI project's refresh.py contract).

Key difference from the rest of this ETL: the ROMI project keys every DWH
query by intBusinessUnitId (the SBU dimension dco.tblbusinessunitArc uses —
NXCM=4, NXES=144, NXRM=175), NOT the flash report's intSBUId/intBusinessAreaId
space (NXCM=58, NXES=36, NXRM=69). The bridge between the two lives in
public.sbu_romi_map (see migration 00013).

Units: ROMI stores RAW BDT (numAmount is not divided by CR_DIVISOR), matching
the officer-entered marketing_expense_total and the 12 existing campaign rows.
Do not "fix" this to Cr — it would silently corrupt the campaign ledger.
"""

from __future__ import annotations

import calendar
import datetime as dt
from typing import Any

import structlog

from .config import Settings
from .db import dwh_query, supabase_conn

log = structlog.get_logger()

# ---- ROMI-locked config (do not change without talking to Abir) ------------

GL_REVENUE = ("3010001", "3010002")  # Sales Local + Sales Foreign
GL_COGS = ("4810001",)
GL_MARKETING = "4210001"

GP_MARGIN_FY_START = "2025-07-01"
GP_MARGIN_FY_END = "2026-07-01"  # exclusive
ORGANIC_LOOKBACK_MONTHS = 6

# Marketing sub-GL categories EXCLUDED from the campaign-spend "pool"
# (trade/people/overhead costs, not campaign activity).
NON_CAMPAIGN_SUBGL_KEYWORDS = [
    "commission", "discount", "salary", "allowence", "bonus", "provident",
    "gratuity", "leave", "overtime", "utility", "it expenses", "bad debt",
    "mro", "telephone", "transportation", "fooding", "loading", "insurance",
    "entertainment", "donation", "subscription", "postage", "courier",
    "printing", "training", "stationaries", "others",
]


# ---- DWH pulls (keyed by intBusinessUnitId, raw BDT) ------------------------

def _monthly_series(
    settings: Settings,
    bu_id: int,
    gl_codes: tuple[str, ...],
    start_date: dt.date,
    end_date: dt.date,
    mode: str,
) -> dict[int, float]:
    """{year*100+month: amount} summed over an inclusive date range.

    mode: 'credit' -> revenue  (numAmount<0, return -numAmount)
          'debit'  -> marketing (net: positive debit less reversals)
          'net'    -> COGS     (signed, reversals net out)
    """
    placeholders = ",".join("?" for _ in gl_codes)
    if mode == "credit":
        expr = "SUM(-numAmount)"
        extra = "AND numAmount < 0"
    elif mode == "debit":
        expr = "SUM(numAmount)"
        extra = ""
    else:
        expr = "SUM(numAmount)"
        extra = ""

    sql = f"""
        SELECT YEAR(dteTransactionDate) AS y, MONTH(dteTransactionDate) AS m, {expr} AS amt
        FROM fin.tblAccountingJournal
        WHERE intBusinessUnitId = ?
          AND strGeneralLedgerCode IN ({placeholders})
          AND isActive = 1
          {extra}
          AND dteTransactionDate >= ?
          AND dteTransactionDate < ?
        GROUP BY YEAR(dteTransactionDate), MONTH(dteTransactionDate)
    """
    params: tuple[Any, ...] = (bu_id, *gl_codes, start_date, end_date)
    rows = dwh_query(settings, sql, params)
    out: dict[int, float] = {}
    for r in rows:
        key = int(r["y"]) * 100 + int(r["m"])
        out[key] = out.get(key, 0.0) + (float(r["amt"] or 0))
    return out


def revenue_monthly(
    settings: Settings, bu_id: int, start_date: dt.date, end_date: dt.date
) -> dict[int, float]:
    return _monthly_series(settings, bu_id, GL_REVENUE, start_date, end_date, "credit")


def cogs_monthly(
    settings: Settings, bu_id: int, start_date: dt.date, end_date: dt.date
) -> dict[int, float]:
    return _monthly_series(settings, bu_id, GL_COGS, start_date, end_date, "net")


def marketing_monthly(
    settings: Settings, bu_id: int, start_date: dt.date, end_date: dt.date
) -> tuple[dict[int, float], dict[int, float]]:
    """(full, pool) monthly marketing spend. Pool excludes non-campaign SubGL."""
    excl = " OR ".join(
        ["LOWER(strSubGLName) LIKE ?" for _ in NON_CAMPAIGN_SUBGL_KEYWORDS]
    )
    sql = f"""
        SELECT YEAR(dteTransactionDate) AS y, MONTH(dteTransactionDate) AS m,
               SUM(numAmount) AS amt,
               SUM(CASE WHEN ({excl}) THEN 0 ELSE numAmount END) AS pool
        FROM fin.tblAccountingJournal
        WHERE intBusinessUnitId = ?
          AND strGeneralLedgerCode = ?
          AND isActive = 1
          AND dteTransactionDate >= ?
          AND dteTransactionDate < ?
        GROUP BY YEAR(dteTransactionDate), MONTH(dteTransactionDate)
    """
    likes = ["%" + k + "%" for k in NON_CAMPAIGN_SUBGL_KEYWORDS]
    params: tuple[Any, ...] = (*likes, bu_id, GL_MARKETING, start_date, end_date)
    rows = dwh_query(settings, sql, params)
    full: dict[int, float] = {}
    pool: dict[int, float] = {}
    for r in rows:
        key = int(r["y"]) * 100 + int(r["m"])
        full[key] = full.get(key, 0.0) + float(r["amt"] or 0)
        pool[key] = pool.get(key, 0.0) + float(r["pool"] or 0)
    return full, pool


def gp_margin(
    settings: Settings, bu_id: int, start_date: dt.date, end_date: dt.date
) -> float | None:
    """Gross profit margin over a period = (Revenue - COGS) / Revenue."""
    rev = sum(revenue_monthly(settings, bu_id, start_date, end_date).values())
    cogs = sum(cogs_monthly(settings, bu_id, start_date, end_date).values())
    if not rev:
        return None
    return (rev - cogs) / rev


# ---- Date helpers (mirror the ROMI project's dwh.py) ------------------------

def _parse_ym(d: dt.date) -> int:
    return d.year * 100 + d.month


def _shift_ym(key: int, delta_months: int) -> int:
    y, m = divmod(key, 100)
    m += delta_months
    while m <= 0:
        m += 12
        y -= 1
    while m > 12:
        m -= 12
        y += 1
    return y * 100 + m


def _key_to_date(key: int) -> dt.date:
    y, m = divmod(key, 100)
    return dt.date(y, m, 1)


def _key_after(key: int) -> dt.date:
    return _key_to_date(_shift_ym(key, 1))


def _to_key(report_month: str | int | None) -> int | None:
    if report_month is None:
        return None
    if isinstance(report_month, int):
        return report_month
    s = str(report_month).strip()
    if len(s) == 7 and s[4] == "-":
        return int(s[:4]) * 100 + int(s[5:7])
    if len(s) == 6:
        return int(s[:4]) * 100 + int(s[4:6])
    raise ValueError(f"Unrecognized report_month: {report_month!r}")


def _previous_month_key(today: dt.date | None = None) -> int:
    today = today or dt.date.today()
    y, m = today.year, today.month
    m -= 1
    if m == 0:
        m = 12
        y -= 1
    return y * 100 + m


def _extrapolate_current_month(
    rev: dict[int, float], camp_months: list[int], today: dt.date | None = None
) -> dict[int, float]:
    """Scale a still-running current month up to a full-month estimate."""
    if today is None:
        today = dt.date.today()
    cur = today.year * 100 + today.month
    if cur in camp_months and rev.get(cur):
        days_total = calendar.monthrange(today.year, today.month)[1]
        if 0 < today.day < days_total:
            rev = dict(rev)
            rev[cur] = rev[cur] * days_total / today.day
    return rev


# ---- Compute (monthly, mirrors engine.py::compute_metrics) ------------------

def compute_metrics(
    settings: Settings,
    bu_id: int,
    start_date: dt.date,
    end_date: dt.date,
    gp_margin: float | None = None,
    report_month: str | int | None = None,
) -> dict[str, Any]:
    """Monthly ROMI base metrics for a single reporting month.

    A campaign is scored only for the month it is ACTIVE. Long campaigns are
    re-scored each month they run.
    """
    m_key = _to_key(report_month) if report_month is not None else _previous_month_key()
    if m_key is None:
        m_key = _previous_month_key()
    m_start = _key_to_date(m_key)
    m_end = _key_after(m_key)
    active = (start_date < m_end) and (end_date >= m_start)

    # F: reporting-month revenue (current month extrapolated)
    rev = revenue_monthly(settings, bu_id, m_start, m_end)
    rev = _extrapolate_current_month(rev, [m_key])
    f = rev.get(m_key, 0.0)

    # H: SPLY revenue (same month, one year earlier)
    h_key = _shift_ym(m_key, -12)
    h = revenue_monthly(settings, bu_id, _key_to_date(h_key), _key_after(h_key)).get(h_key, 0.0)

    # G: organic/base = plain 6-month average before campaign start
    start_key = _parse_ym(start_date)
    lookback_keys = [_shift_ym(start_key, -i) for i in range(1, ORGANIC_LOOKBACK_MONTHS + 1)]
    lb_from = _key_to_date(min(lookback_keys))
    lb_to = _key_after(max(lookback_keys))
    rev_lb = revenue_monthly(settings, bu_id, lb_from, lb_to)
    g = sum(rev_lb.get(k, 0.0) for k in lookback_keys) / ORGANIC_LOOKBACK_MONTHS

    # G_SPLY: same 6-month lookback, one year earlier (trend denominator)
    sply_lb_keys = [_shift_ym(k, -12) for k in lookback_keys]
    rev_slb = revenue_monthly(
        settings, bu_id, _key_to_date(min(sply_lb_keys)), _key_after(max(sply_lb_keys))
    )
    g_sply = sum(rev_slb.get(k, 0.0) for k in sply_lb_keys) / ORGANIC_LOOKBACK_MONTHS

    # J: GP margin (fixed per SBU), computed if not supplied
    if gp_margin is None:
        gp_margin = self_gp_margin(settings, bu_id)

    # O_M: GL campaign-able marketing spend in the reporting month
    _, pool = marketing_monthly(settings, bu_id, m_start, m_end)
    o_monthly = pool.get(m_key, 0.0)

    baseline = g if g > 0 else (h or 0.0)
    incr = f - baseline

    return {
        "f": f,
        "g": g,
        "g_sply": g_sply,
        "h": h,
        "j": gp_margin,
        "o_monthly": o_monthly,
        "n_months": 1,
        "active": active,
        "baseline": baseline,
        "incr_rev": incr,
        "short_campaign": (end_date - start_date).days < 15,
    }


def self_gp_margin(settings: Settings, bu_id: int) -> float | None:
    return gp_margin(
        settings,
        bu_id,
        dt.date.fromisoformat(GP_MARGIN_FY_START),
        dt.date.fromisoformat(GP_MARGIN_FY_END),
    )


# ---- Refresh orchestration --------------------------------------------------

def refresh_one(
    settings: Settings, campaign: dict[str, Any], gp_margin_by_bu: dict[int, float | None]
) -> tuple[dict[str, Any], list[str]]:
    """Compute + build the column update for one campaign row."""
    bu_id = int(campaign["business_unit_id"])
    start = campaign["start_date"]
    end = campaign["end_date"]
    if isinstance(start, str):
        start = dt.date.fromisoformat(start)
    if isinstance(end, str):
        end = dt.date.fromisoformat(end)

    gp = gp_margin_by_bu.get(bu_id)
    m = compute_metrics(
        settings, bu_id, start, end, gp_margin=gp, report_month=campaign.get("report_month")
    )

    updates = {
        "actual_rev": m["f"],
        "organic_rev": m["g"],
        "organic_rev_sply": m["g_sply"],
        "sply_rev": m["h"],
        "gp_margin": m["j"],
        "spend_pool_total": m["o_monthly"],
        "n_months": m["n_months"],
        "as_of": dt.datetime.now(dt.UTC).isoformat(),
    }

    warnings: list[str] = []
    name = campaign.get("campaign_name") or campaign.get("id")
    if m.get("short_campaign"):
        days = max(1, (end - start).days)
        warnings.append(
            f"{name}: campaign spans only {days} day(s) — monthly ROMI "
            "attribution is unreliable for such short events."
        )
    o = campaign.get("marketing_expense_total")
    pool = m["o_monthly"]
    if pool and o:
        dev = (float(o) - pool) / max(pool, float(o), 1.0)
        if abs(dev) > 0.2:
            warnings.append(
                f"{name}: entered expense (O) differs from the DWH monthly "
                f"marketing spend by {dev*100:+,.0f}% — please reconcile."
            )
    return updates, warnings


def refresh_romi(settings: Settings) -> dict[str, Any]:
    """Refresh every campaign's computed columns from the DWH.

    Returns {total, updated, errors, warnings}. Never touches *_ov columns.
    """
    sbus = _fetch_romi_sbus(settings)
    gp_margin_by_bu = {int(s["business_unit_id"]): s.get("gp_margin") for s in sbus}
    campaigns = _fetch_romi_campaigns(settings)

    updated = 0
    errors: list[str] = []
    warnings: list[str] = []
    for c in campaigns:
        try:
            updates, warns = refresh_one(settings, c, gp_margin_by_bu)
            _update_campaign_computed(settings, int(c["id"]), updates)
            updated += 1
            warnings.extend(warns)
        except Exception as exc:  # noqa: BLE001 — one bad campaign must not kill the batch
            errors.append(f"{c.get('campaign_name') or c.get('id')}: {exc}")
            log.warning(
                "romi refresh campaign failed", campaign=c.get("campaign_name"), error=str(exc)
            )

    return {"total": len(campaigns), "updated": updated, "errors": errors, "warnings": warnings}


def _fetch_romi_sbus(settings: Settings) -> list[dict[str, Any]]:
    with supabase_conn(settings) as conn, conn.cursor() as cur:
        cur.execute("SELECT business_unit_id, gp_margin FROM public.romi_sbu")
        cols = [c[0] for c in (cur.description or [])]
        return [dict(zip(cols, row, strict=True)) for row in cur.fetchall()]


def _fetch_romi_campaigns(settings: Settings) -> list[dict[str, Any]]:
    with supabase_conn(settings) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, business_unit_id, campaign_name, start_date, end_date, "
            "report_month, marketing_expense_total FROM public.romi_campaign "
            "ORDER BY id"
        )
        cols = [c[0] for c in (cur.description or [])]
        return [dict(zip(cols, row, strict=True)) for row in cur.fetchall()]


def _update_campaign_computed(
    settings: Settings, campaign_id: int, updates: dict[str, Any]
) -> None:
    sql = """
    UPDATE public.romi_campaign
    SET actual_rev = %s, organic_rev = %s, organic_rev_sply = %s, sply_rev = %s,
        gp_margin = %s, spend_pool_total = %s, n_months = %s, as_of = %s
    WHERE id = %s
    """
    params = (
        updates["actual_rev"],
        updates["organic_rev"],
        updates["organic_rev_sply"],
        updates["sply_rev"],
        updates["gp_margin"],
        updates["spend_pool_total"],
        updates["n_months"],
        updates["as_of"],
        campaign_id,
    )
    with supabase_conn(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
        conn.commit()
