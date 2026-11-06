"""Partner feed (demo retail-chain source) connector.

Pulls POS sales + net-profit data from the partner portal
(``https://partner-portal.example.com``) and maps it into the flash-report schema.

The portal exposes a read-only JSON API at ``/sme/{Controller}/{Action}`` whose
query string and response body are AES-128-CBC encrypted with a fixed session
key derived from the ``byPass`` value returned at login::

    key = IV = str(int(byPass)).encode("utf-8")   # 16 ASCII bytes

Required request headers (the ``Accept`` value matters — a bare
``application/json`` makes the server truncate the response)::

    Accept: application/json, text/plain, */*
    Content-Type: application/json
    Authorization: Bearer <JWT>

Money is BDT. We do NOT divide by the flash report's 1e7 crore divisor here —
PartnerFeed figures are kept in raw BDT and the frontend formats them as Tk / Cr.

Credentials live in ``apps/etl/.env``. Two auth modes:

* ``PARTNER_FEED_MOBILE`` + ``PARTNER_FEED_PASSWORD`` — full login (production).
* ``PARTNER_FEED_TOKEN`` — reuse a live session token (local dev / no password).
"""

from __future__ import annotations

import base64
import datetime as dt
import json
from typing import Any

import requests
import structlog
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from .config import Settings
from .models import (
    PartnerFeedDailySale,
    PartnerFeedDailyTotal,
    PartnerFeedOffice,
    PartnerFeedOfficePl,
)

log = structlog.get_logger()

_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
}

# The daily-sales endpoint keys amounts by "YYYY-MM-DDT00:00:00". The net P&L
# endpoint returns "YYYY-MM-DDT00:00:00" / "YYYY-MM-DDT23:59:59" bounds.
_DATE_SUFFIXES = ("T00:00:00", "T23:59:59", "T00:00:00Z")


# ---------------------------------------------------------------------------
# AES helpers (mirror the frontend's encryptionApiList contract)
# ---------------------------------------------------------------------------

def _key(bypass: str) -> bytes:
    return str(int(bypass)).encode("utf-8")


def _encrypt(plain: str, bypass: str) -> str:
    k = _key(bypass)
    padder = padding.PKCS7(128).padder()
    data = padder.update(plain.encode("utf-8")) + padder.finalize()
    enc = Cipher(algorithms.AES(k), modes.CBC(k)).encryptor()
    return base64.b64encode(enc.update(data) + enc.finalize()).decode("ascii")


def _decrypt(b64: str, bypass: str) -> str:
    k = _key(bypass)
    raw = base64.b64decode(b64)
    dec = Cipher(algorithms.AES(k), modes.CBC(k)).decryptor()
    pt = dec.update(raw) + dec.finalize()
    unpadder = padding.PKCS7(128).unpadder()
    return (unpadder.update(pt) + unpadder.finalize()).decode("utf-8")


def _parse_iso(s: str) -> dt.date:
    """Parse a portal date string ('YYYY-MM-DD[T...]') to a date."""
    return dt.date.fromisoformat(str(s)[:10])


def _clean(s: str) -> str:
    """Normalise non-breaking spaces and strip surrounding whitespace."""
    return s.replace("\u00a0", " ").strip()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def login(settings: Settings) -> str:
    """Log in with the portal account and return the JWT access token."""
    if not settings.partner_feed_mobile or not settings.partner_feed_password:
        raise RuntimeError(
            "PARTNER_FEED_MOBILE / PARTNER_FEED_PASSWORD are not set — cannot log in "
            "to the PartnerFeed portal."
        )
    url = f"{settings.partner_feed_base_url}/identity/LogIn/UserLogIn"
    resp = requests.post(
        url,
        json={"userName": settings.partner_feed_mobile, "password": settings.partner_feed_password},
        headers={"Content-Type": "application/json", "Accept": "application/json, text/plain, */*"},
        timeout=60,
    )
    resp.raise_for_status()
    payload = resp.json()
    bypass = payload.get("byPass") or settings.partner_feed_bypass
    profile = json.loads(_decrypt(payload["data"], bypass))
    token = profile.get("auth", {}).get("token") or profile.get("token")
    if not token:
        raise RuntimeError("PartnerFeed login returned no access token.")
    log.info("partner_feed login ok", account=profile.get("accountName"))
    return token


def _token(settings: Settings) -> str:
    if settings.partner_feed_token:
        return settings.partner_feed_token
    return login(settings)


def _get(settings: Settings, action: str, params: dict[str, Any]) -> Any:
    """GET a portal endpoint with AES-encrypted query + decrypted response."""
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    url = f"{settings.partner_feed_base_url}/sme/{action}?{_encrypt(qs, settings.partner_feed_bypass)}"
    headers = {**_HEADERS, "Authorization": f"Bearer {_token(settings)}"}
    resp = requests.get(url, headers=headers, timeout=120)
    resp.raise_for_status()
    body = resp.content.decode("utf-8", "replace").strip()
    return json.loads(_decrypt(body, settings.partner_feed_bypass))


# ---------------------------------------------------------------------------
# Pulls
# ---------------------------------------------------------------------------

def fetch_daily_sales(
    settings: Settings, from_date: dt.date, to_date: dt.date
) -> tuple[list[PartnerFeedDailyTotal], list[PartnerFeedDailySale]]:
    """Company-wide daily sales + department x category breakdown (BDT)."""
    payload = _get(
        settings,
        "POSSalesReport/DateWiseDeptOfficeSalesReport",
        {
            "accountId": settings.partner_feed_account_id,
            "branchId": settings.partner_feed_branch_id,
            "userId": settings.partner_feed_user_id,
            "fromDate": from_date.isoformat(),
            "toDate": to_date.isoformat(),
        },
    )
    if not isinstance(payload, dict):
        return [], []

    totals: list[PartnerFeedDailyTotal] = []
    for key, amount in (payload.get("grandTotals") or {}).items():
        totals.append(PartnerFeedDailyTotal(report_date=_parse_iso(key), amount=float(amount or 0)))

    sales: list[PartnerFeedDailySale] = []
    for row in payload.get("data") or []:
        dept = str(row.get("departmentName") or "")
        cat = str(row.get("categoryName") or "")
        for key, amount in (row.get("dateAmounts") or {}).items():
            sales.append(
                PartnerFeedDailySale(
                    report_date=_parse_iso(key),
                    department_name=dept,
                    category_name=cat,
                    amount=float(amount or 0),
                )
            )
    return totals, sales


def _office_map(settings: Settings) -> dict[int, PartnerFeedOffice]:
    """Authoritative office dimension from ``GetOfficeDDLForGlobal``.

    The net P&L endpoint's ``strOfficeName`` field is unreliable (it varies per
    line item within a single ``intOfficeId``), so names come from this DDL —
    whose ``value`` shares the same id space as ``intOfficeId``.
    """
    data = _get(
        settings,
        "ActivityPermission/GetOfficeDDLForGlobal",
        {
            "accountId": settings.partner_feed_account_id,
            "branchId": settings.partner_feed_branch_id,
            "userId": settings.partner_feed_user_id,
        },
    )
    if isinstance(data, dict):
        data = data.get("data") or []
    offices: dict[int, PartnerFeedOffice] = {}
    for r in data:
        try:
            office_id = int(r["value"])
        except (KeyError, TypeError, ValueError):
            continue
        name = _clean(str(r.get("label") or "") or str(r.get("officeName") or ""))
        offices[office_id] = PartnerFeedOffice(
            office_id=office_id,
            name=name,
            address=_clean(str(r.get("address") or "")) or None,
        )
    return offices


def fetch_office_pl(
    settings: Settings, from_date: dt.date, to_date: dt.date
) -> tuple[list[PartnerFeedOffice], list[PartnerFeedOfficePl]]:
    """Net P&L aggregated to (office x department) for the period (BDT).

    The raw endpoint returns one row per (office x item) with quantity, net
    sales, cost, profit and a per-item margin. We collapse to office x
    department and recompute margin at the aggregate level (the per-item margin
    percentage is not additive).

    Returns ``(offices, pl_rows)`` where ``offices`` is the full DDL office
    dimension and each P&L row's ``office_name`` is resolved from that same DDL
    (the endpoint's own ``strOfficeName`` is not trustworthy).
    """
    offices = _office_map(settings)
    payload = _get(
        settings,
        "POSSalesReport/NetProfitLossByDepartmentNew",
        {
            "accountId": settings.partner_feed_account_id,
            "branchId": settings.partner_feed_branch_id,
            "userId": settings.partner_feed_user_id,
            "fromDate": from_date.isoformat(),
            "toDate": to_date.isoformat(),
        },
    )
    if isinstance(payload, dict):
        rows = payload.get("data") or []
    elif isinstance(payload, list):
        rows = payload
    else:
        rows = []
    period_month = from_date.replace(day=1)

    agg: dict[tuple[int, str], dict[str, float]] = {}
    for r in rows:
        try:
            office_id = int(r["intOfficeId"])
            dept = str(r.get("departmentName") or "")
        except (KeyError, TypeError, ValueError):
            continue
        slot = agg.setdefault(
            (office_id, dept), {"quantity": 0.0, "net_sales": 0.0, "cost": 0.0, "profit": 0.0}
        )
        slot["quantity"] += float(r.get("quantity") or 0)
        slot["net_sales"] += float(r.get("extNetSales") or 0)
        slot["cost"] += float(r.get("costAmount") or 0)
        slot["profit"] += float(r.get("extProfitLoss") or 0)

    out: list[PartnerFeedOfficePl] = []
    for (office_id, dept), v in agg.items():
        office = offices.get(office_id)
        office_name = office.name if office else f"#{office_id}"
        margin = (v["profit"] / v["net_sales"] * 100) if v["net_sales"] else 0.0
        out.append(
            PartnerFeedOfficePl(
                period_month=period_month,
                office_id=office_id,
                office_name=office_name,
                department_name=dept,
                quantity=v["quantity"],
                net_sales=v["net_sales"],
                cost=v["cost"],
                profit=v["profit"],
                margin=margin,
            )
        )
    return list(offices.values()), out


def refresh(settings: Settings, from_date: dt.date, to_date: dt.date) -> dict[str, int]:
    """Pull every PartnerFeed dataset for a window. Returns row counts."""
    totals, sales = fetch_daily_sales(settings, from_date, to_date)
    offices, pl = fetch_office_pl(settings, from_date, to_date)
    return {
        "offices": len(offices),
        "daily_total": len(totals),
        "daily_sales": len(sales),
        "office_pl": len(pl),
    }
