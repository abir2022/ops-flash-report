from flash_etl.constants import GL_MARKETING
from flash_etl.queries import (
    MARKETING_SPEND_DETAIL_SQL,
    MARKETING_SPEND_MONTHLY_SQL,
    MARKETING_SPEND_SQL,
)


def test_marketing_spend_uses_locked_gl_code():
    # Marketing spend is GL 4210001 — a different code (e.g. a revenue GL)
    # would silently produce the wrong number.
    assert GL_MARKETING == "4210001"
    assert "4210001" in MARKETING_SPEND_SQL


def test_marketing_spend_is_netted_no_sign_filter():
    # Marketing expense is a debit (positive numAmount), but the ERP's daily
    # "auto provision adjustment" credit reversals must net out, so the query
    # sums numAmount WITHOUT a sign filter (mirrors revenue netting). No sign
    # flip, and no numAmount > 0 filter.
    assert "numAmount > 0" not in MARKETING_SPEND_SQL
    assert "-j.numAmount" not in MARKETING_SPEND_SQL
    assert "j.numAmount/" in MARKETING_SPEND_SQL


def test_marketing_spend_remaps_sbu_zero_and_scopes_to_report():
    # SBU-0 -> NXCM(58) remap and report-scope restriction must be present so
    # the FK to sbu holds and non-report areas (e.g. 65) never leak in.
    assert "intSBUId = 0" in MARKETING_SPEND_SQL or "= 0" in MARKETING_SPEND_SQL
    assert "58" in MARKETING_SPEND_SQL
    assert "NOT IN" in MARKETING_SPEND_SQL


def test_marketing_spend_detail_groups_by_subgl():
    # The purpose breakdown must be a SubGL-level GROUP BY (strSubGlCode /
    # strSubGLName) with the same debit + remap + scope rules, and it must
    # coalesce a NULL SubGL code so spend is never silently dropped.
    assert "4210001" in MARKETING_SPEND_DETAIL_SQL
    assert "strSubGlCode" in MARKETING_SPEND_DETAIL_SQL
    assert "strSubGLName" in MARKETING_SPEND_DETAIL_SQL
    assert "GROUP BY" in MARKETING_SPEND_DETAIL_SQL
    assert "numAmount > 0" not in MARKETING_SPEND_DETAIL_SQL
    assert "ISNULL" in MARKETING_SPEND_DETAIL_SQL


def test_marketing_spend_monthly_groups_by_month():
    # The trend line needs a calendar-month series (DATEFROMPARTS) grouped by
    # SBU, keeping the locked GL + remap + scope rules.
    assert "4210001" in MARKETING_SPEND_MONTHLY_SQL
    assert "DATEFROMPARTS" in MARKETING_SPEND_MONTHLY_SQL
    assert "GROUP BY" in MARKETING_SPEND_MONTHLY_SQL
    assert "numAmount > 0" not in MARKETING_SPEND_MONTHLY_SQL
