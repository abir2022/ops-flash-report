from datetime import date

from flash_etl.pipeline import _date_range


def test_date_range_inclusive():
    assert _date_range(date(2026, 9, 4), date(2026, 9, 6)) == [
        date(2026, 9, 4),
        date(2026, 9, 5),
        date(2026, 9, 6),
    ]


def test_date_range_single_day():
    assert _date_range(date(2026, 9, 6), date(2026, 9, 6)) == [date(2026, 9, 6)]


def test_date_range_empty_when_reversed():
    assert _date_range(date(2026, 9, 6), date(2026, 9, 4)) == []


def test_date_range_crosses_month():
    start, end = date(2026, 8, 30), date(2026, 9, 2)
    assert _date_range(start, end) == [
        date(2026, 8, 30),
        date(2026, 8, 31),
        date(2026, 9, 1),
        date(2026, 9, 2),
    ]
