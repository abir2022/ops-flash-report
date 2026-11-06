"""Typed data contracts shared across the ETL.

Field names here MUST match the DB columns and the frontend types.
This single source of truth eliminates the "silent zero" class of bugs.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime


@dataclass
class SbuRevenue:
    """One SBU's revenue sub-schedule row (net of returns, Cr)."""

    sbu: int
    daily: float = 0.0
    dod: float = 0.0
    mtd: float = 0.0
    mom: float = 0.0
    yoy: float = 0.0
    fy_ytd: float = 0.0
    cy_ytd: float = 0.0


@dataclass
class SbuVolume:
    """One SBU's delivery volume — raw quantity in its dominant UOM."""

    sbu: int
    daily: float = 0.0
    mtd: float = 0.0
    mom: float = 0.0
    uom: str = ""  # e.g. 'Metric Tons', 'Bag', 'Kilogram', 'Cubic Foot', 'Liter'
    has_vol: bool = False


@dataclass
class Target:
    """One SBU/channel monthly target pulled from Google Sheets."""

    mo_rev: float | None = None  # Target Value (Cr)
    mo_vol: float | None = None  # Target Volume (raw, UOM is per-SBU convention)


@dataclass
class Reconciliation:
    """Two-column reconciliation card totals (Cr)."""

    report_date: date
    g1all: float = 0.0
    excl: float = 0.0
    g2all: float = 0.0
    g5all: float = 0.0
    g6all: float = 0.0
    g4all: float = 0.0
    rpt_gl1: float = 0.0
    rpt_frt: float = 0.0
    rpt_tot: float = 0.0
    full_tot: float = 0.0
    gap: float = 0.0


@dataclass
class Snapshot:
    """A fully computed, ready-to-upsert daily snapshot row."""

    sbu_id: int
    report_date: date
    channel: str = "default"
    src: str = "GL 3010001-06"
    daily_rev: float = 0.0
    dod_rev: float = 0.0
    mtd_rev: float = 0.0
    mom_rev: float = 0.0
    yoy_rev: float = 0.0
    fy_ytd_rev: float = 0.0
    cy_ytd_rev: float = 0.0
    daily_vol: float | None = None
    dod_vol: float | None = None
    mtd_vol: float | None = None
    mom_vol: float | None = None
    vol_uom: str | None = None
    has_vol: bool = False
    mo_tgt_rev: float | None = None
    mtd_tgt_rev: float | None = None
    mo_tgt_vol: float | None = None
    mtd_tgt_vol: float | None = None
    mtd_ach_pct: float | None = None
    mom_pct: float | None = None
    yoy_pct: float | None = None
    proj_rev: float = 0.0
    momentum: str = "N/A"


@dataclass
class TrendPoint:
    sbu_id: int
    d: date
    channel: str
    value: float


@dataclass
class ItemMaster:
    """One SKU (item) dimension row."""

    item_id: int
    item_code: str | None = None
    item_name: str | None = None
    category_id: int | None = None
    category_name: str | None = None


@dataclass
class SkuSale:
    """One item x day quantity + allocated revenue (Cr)."""

    sbu_id: int
    item_id: int
    d: date
    channel: str = "default"
    quantity: float = 0.0
    uom: str = ""
    value: float = 0.0


@dataclass
class MarketingSpend:
    """One SBU's marketing spend (GL 4210001) for a report date, in Cr."""

    sbu_id: int
    report_date: date
    mtd: float = 0.0
    mom: float = 0.0
    yoy: float = 0.0
    fy_ytd: float = 0.0


@dataclass
class MarketingSpendDetail:
    """One SBU x SubGL marketing-spend slice for a report date, in Cr."""

    sbu_id: int
    report_date: date
    subgl_code: str
    subgl_name: str
    mtd: float = 0.0


@dataclass
class MarketingSpendMonthly:
    """One SBU x calendar-month marketing-spend total, in Cr."""

    sbu_id: int
    period_month: date
    spend: float = 0.0


@dataclass
class SyncHealth:
    latest_post: datetime | None
    lag_hours: float | None
    is_stalled: bool
    reason: str = ""


@dataclass
class RunResult:
    status: str = "success"  # success | failed | stalled
    report_date: date | None = None
    error: str = ""
    meta: dict = field(default_factory=dict)


@dataclass
class PartnerFeedOffice:
    """One partner outlet (office dimension)."""

    office_id: int
    name: str
    address: str | None = None


@dataclass
class PartnerFeedDailyTotal:
    """Company-wide daily POS sales for one day (BDT)."""

    report_date: date
    amount: float = 0.0


@dataclass
class PartnerFeedDailySale:
    """Company-wide daily sales for one department x category (BDT)."""

    report_date: date
    department_name: str
    category_name: str
    amount: float = 0.0


@dataclass
class PartnerFeedOfficePl:
    """Monthly net P&L for one outlet x department (BDT)."""

    period_month: date
    office_id: int
    office_name: str
    department_name: str
    quantity: float = 0.0
    net_sales: float = 0.0
    cost: float = 0.0
    profit: float = 0.0
    margin: float = 0.0
