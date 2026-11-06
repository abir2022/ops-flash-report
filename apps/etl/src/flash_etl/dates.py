"""Date-window resolution for a report date."""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, timedelta


@dataclass(frozen=True)
class DateContext:
    report_date: date
    dod: date
    month_start: date
    month_end_excl: date  # report_date + 1
    prev_month_start: date
    prev_month_end_excl: date
    yoy_start: date
    yoy_end_excl: date
    fy_start: date  # Jul 1 of current FY
    cy_start: date  # Jan 1
    days_elapsed: int
    days_in_month: int

    @property
    def month_factor(self) -> float:
        return self.days_elapsed / self.days_in_month


def fiscal_year_start(rd: date) -> date:
    return date(rd.year, 7, 1) if rd.month >= 7 else date(rd.year - 1, 7, 1)


def _same_day_end_excl(year: int, month: int, ref_day: int) -> date:
    """End-exclusive date for the first `ref_day` days of (year, month).

    Capped at month end (day N in a 31-day month vs a shorter prior month).
    """
    dim = calendar.monthrange(year, month)[1]
    if ref_day >= dim:
        return date(year, month, dim) + timedelta(days=1)
    return date(year, month, ref_day + 1)


def build_date_context(rd: date) -> DateContext:
    dod = rd - timedelta(days=1)
    month_start = rd.replace(day=1)
    month_end_excl = rd + timedelta(days=1)

    # Previous-month window: SAME elapsed days (MoM pace), not the full month.
    # Comparing 2 days of Sep vs all 31 of Aug would make every SBU read
    # "Negative" momentum for the first ~20 days of the month.
    if month_start.month == 1:
        prev_month_start = date(month_start.year - 1, 12, 1)
        prev_year, prev_month = month_start.year - 1, 12
    else:
        prev_month_start = date(month_start.year, month_start.month - 1, 1)
        prev_year, prev_month = month_start.year, month_start.month - 1
    prev_month_end_excl = _same_day_end_excl(prev_year, prev_month, rd.day)

    # YoY window (same month prior year, same elapsed days)
    yoy_start = date(rd.year - 1, rd.month, 1)
    yoy_end_excl = _same_day_end_excl(rd.year - 1, rd.month, rd.day)

    fy_start = fiscal_year_start(rd)
    cy_start = date(rd.year, 1, 1)

    days_in_month = calendar.monthrange(rd.year, rd.month)[1]
    days_elapsed = rd.day

    return DateContext(
        report_date=rd,
        dod=dod,
        month_start=month_start,
        month_end_excl=month_end_excl,
        prev_month_start=prev_month_start,
        prev_month_end_excl=prev_month_end_excl,
        yoy_start=yoy_start,
        yoy_end_excl=yoy_end_excl,
        fy_start=fy_start,
        cy_start=cy_start,
        days_elapsed=days_elapsed,
        days_in_month=days_in_month,
    )
