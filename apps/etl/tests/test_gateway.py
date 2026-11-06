from datetime import date, datetime

import pytest

from flash_etl.gateway import _coerce_value, _literal, render_sql


def test_render_sql_inlines_date_int_and_str():
    sql = "SELECT ? AS d, ? AS n, ? AS s, ? AS x"
    rendered = render_sql(sql, (date(2026, 10, 6), 58, "3010001", None))
    assert rendered == (
        "SELECT '2026-10-06' AS d, 58 AS n, '3010001' AS s, NULL AS x"
    )


def test_render_sql_escapes_single_quotes():
    rendered = render_sql("SELECT ?", ("o'brien",))
    assert rendered == "SELECT 'o''brien'"


def test_render_sql_placeholder_count_mismatch_raises():
    with pytest.raises(ValueError):
        render_sql("SELECT ?, ?", (1,))


def test_literal_datetime_and_bool():
    assert _literal(datetime(2026, 10, 6, 1, 2, 3)) == "'2026-10-06 01:02:03'"
    assert _literal(True) == "1"
    assert _literal(3.5) == "3.5"


def test_coerce_value_date_and_datetime():
    assert _coerce_value("2026-10-06") == date(2026, 10, 6)
    assert _coerce_value("2026-10-06T00:20:55.250000") == datetime(
        2026, 10, 6, 0, 20, 55, 250000
    )


def test_coerce_value_leaves_others_untouched():
    assert _coerce_value("3010001") == "3010001"
    assert _coerce_value(58) == 58
    assert _coerce_value(None) is None
