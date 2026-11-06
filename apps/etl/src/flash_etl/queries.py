"""SQL queries against the live ERP via the enterprise API gateway.

Every query uses explicit column names (never SELECT *) — hidden RowVer
binary columns break serialization. All revenue queries are NET of returns
(SUM(-numAmount), no numAmount<0 filter) and remap intSBUId=0 -> NXCM(58).
"""

from __future__ import annotations

from .constants import (
    NXAB_ASPHALT_CHANNELS,
    NXAB_LUBEX_CHANNELS,
    NXAB_ID,
    CR_DIVISOR,
    FREIGHT_SBUS,
    GL_AGENCY,
    GL_FREIGHT,
    GL_MARKETING,
    GL_OTHER_INCOME,
    GL_REVENUE,
    GL_SALES_FOREIGN,
    GL_SALES_LOCAL,
    RECON_ONLY_SBUS,
    SBU_ACCL,
    SBU_UNALLOCATED,
    SORTED_SBU_IDS,
)
from .romi import NON_CAMPAIGN_SUBGL_KEYWORDS

_SBU_PLACEHOLDERS = ",".join("?" for _ in GL_REVENUE)
_RECON_EXCL = ",".join(str(x) for x in sorted(RECON_ONLY_SBUS))
_FREIGHT_IN = ",".join(str(x) for x in sorted(FREIGHT_SBUS))
_ASPHALT_IN = ",".join(str(x) for x in sorted(NXAB_ASPHALT_CHANNELS))
_LUBEX_IN = ",".join(str(x) for x in sorted(NXAB_LUBEX_CHANNELS))
_SKU_SBU_IN = ",".join(str(x) for x in sorted(SORTED_SBU_IDS))

# ---------------------------------------------------------------------------
# Sync-health: last GL 3010001 post.
# ---------------------------------------------------------------------------
SYNC_HEALTH_SQL = """
SELECT MAX(dteLastActionDateTime) AS latest_post
FROM fin.tblAccountingJournal
WHERE strGeneralLedgerCode = ? AND dteTransactionDate >= ?
"""

# ---------------------------------------------------------------------------
# Main revenue sub-schedule — all SBUs, net of returns, SBU-0 remapped.
# Param order: rd, rd-1, month_start, rd+1, prev_start, prev_end,
#              yoy_start, yoy_end, fy_start, cy_start
# ---------------------------------------------------------------------------
REVENUE_SQL = f"""
SELECT CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END AS sbu,
  SUM(CASE WHEN CAST(j.dteTransactionDate AS DATE) = ? THEN -j.numAmount/{CR_DIVISOR} ELSE 0 END) AS daily,
  SUM(CASE WHEN CAST(j.dteTransactionDate AS DATE) = ? THEN -j.numAmount/{CR_DIVISOR} ELSE 0 END) AS dod,
  SUM(CASE WHEN j.dteTransactionDate >= ? AND j.dteTransactionDate < ? THEN -j.numAmount/{CR_DIVISOR} ELSE 0 END) AS mtd,
  SUM(CASE WHEN j.dteTransactionDate >= ? AND j.dteTransactionDate < ? THEN -j.numAmount/{CR_DIVISOR} ELSE 0 END) AS mom,
  SUM(CASE WHEN j.dteTransactionDate >= ? AND j.dteTransactionDate < ? THEN -j.numAmount/{CR_DIVISOR} ELSE 0 END) AS yoy,
  SUM(CASE WHEN j.dteTransactionDate >= ? AND j.dteTransactionDate < ? THEN -j.numAmount/{CR_DIVISOR} ELSE 0 END) AS fy_ytd,
  SUM(CASE WHEN j.dteTransactionDate >= ? AND j.dteTransactionDate < ? THEN -j.numAmount/{CR_DIVISOR} ELSE 0 END) AS cy_ytd
FROM fin.tblAccountingJournal j
WHERE j.strGeneralLedgerCode IN ({_SBU_PLACEHOLDERS}) AND j.isActive = 1
  AND j.intSBUId NOT IN ({_RECON_EXCL})
GROUP BY CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END
ORDER BY sbu
"""

# ---------------------------------------------------------------------------
# Reconciliation — all six totals in one pass (MTD window).
# Param order: month_start, rd+1
# ---------------------------------------------------------------------------
RECON_SQL = f"""
SELECT
  SUM(CASE WHEN strGeneralLedgerCode = '{GL_SALES_LOCAL}' THEN -numAmount ELSE 0 END)/{CR_DIVISOR} AS g1all,
  SUM(CASE WHEN strGeneralLedgerCode = '{GL_SALES_LOCAL}' AND intSBUId IN ({_RECON_EXCL}) THEN -numAmount ELSE 0 END)/{CR_DIVISOR} AS excl,
  SUM(CASE WHEN strGeneralLedgerCode = '{GL_SALES_FOREIGN}' THEN -numAmount ELSE 0 END)/{CR_DIVISOR} AS g2all,
  SUM(CASE WHEN strGeneralLedgerCode = '{GL_FREIGHT}' THEN -numAmount ELSE 0 END)/{CR_DIVISOR} AS g5all,
  SUM(CASE WHEN strGeneralLedgerCode = '{GL_AGENCY}' THEN -numAmount ELSE 0 END)/{CR_DIVISOR} AS g6all,
  SUM(CASE WHEN strGeneralLedgerCode = '{GL_OTHER_INCOME}' THEN -numAmount ELSE 0 END)/{CR_DIVISOR} AS g4all,
  SUM(CASE WHEN strGeneralLedgerCode = '{GL_SALES_LOCAL}' AND intSBUId NOT IN ({_RECON_EXCL}) THEN -numAmount ELSE 0 END)/{CR_DIVISOR} AS rpt_gl1,
  SUM(CASE WHEN strGeneralLedgerCode = '{GL_FREIGHT}' AND intSBUId IN ({_FREIGHT_IN}) THEN -numAmount ELSE 0 END)/{CR_DIVISOR} AS rpt_frt
FROM fin.tblAccountingJournal
WHERE isActive = 1 AND dteTransactionDate >= ? AND dteTransactionDate < ?
"""

# ---------------------------------------------------------------------------
# Daily trend per SBU (FY-start -> rd+1) for drill-downs.
# ---------------------------------------------------------------------------
TREND_SQL = f"""
SELECT CAST(j.dteTransactionDate AS DATE) AS d,
  CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END AS sbu,
  SUM(-j.numAmount/{CR_DIVISOR}) AS value
FROM fin.tblAccountingJournal j
WHERE j.strGeneralLedgerCode IN ({_SBU_PLACEHOLDERS}) AND j.isActive = 1
  AND j.intSBUId NOT IN ({_RECON_EXCL})
  AND j.dteTransactionDate >= ? AND j.dteTransactionDate < ?
GROUP BY CAST(j.dteTransactionDate AS DATE),
  CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END
ORDER BY d, sbu
"""

# ---------------------------------------------------------------------------
# 4-FY daily revenue history per SBU (forecast section). Identical to
# TREND_SQL but restricted to report-scope SBUs (SORTED_SBU_IDS): the GL
# journal also carries non-report business areas (e.g. 65) that are absent
# from the sbu dimension and would otherwise break the FK.
# ---------------------------------------------------------------------------
HISTORY_SQL = f"""
SELECT CAST(j.dteTransactionDate AS DATE) AS d,
  CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END AS sbu,
  SUM(-j.numAmount/{CR_DIVISOR}) AS value
FROM fin.tblAccountingJournal j
WHERE j.strGeneralLedgerCode IN ({_SBU_PLACEHOLDERS}) AND j.isActive = 1
  AND j.intSBUId NOT IN ({_RECON_EXCL})
  AND j.dteTransactionDate >= ? AND j.dteTransactionDate < ?
  AND CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END IN ({_SKU_SBU_IN})
GROUP BY CAST(j.dteTransactionDate AS DATE),
  CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END
ORDER BY d, sbu
"""

# ---------------------------------------------------------------------------
# NXAB (SBU 98) asphalt/lubex split — computed fresh daily.
#
# Channel fold-in (confirmed): asphalt = {111 Asphalt, 130 Bitumen};
# lubex = {125 Lubricants, 128 B2B Lube Oil, 129 B2C Lube Oil}. The tracker
# labels the lube business "Lubex" even though the DWH has no such channel.
#
# The channel lookup is wrapped in a derived table that selects only
# intDeliveryId + intDistributionChannelId (NOT intBusinessUnitId). The
# gateway auto-scopes every query with an unqualified "intBusinessUnitId IN
# (...)" filter; a plain join of the journal to the delivery header exposes two
# intBusinessUnitId columns and errors as ambiguous.
#
# Param order: month_start, rd+1
# ---------------------------------------------------------------------------
NXAB_SPLIT_SQL = f"""
SELECT
  SUM(CASE WHEN d.channel IN ({_ASPHALT_IN}) THEN -j.numAmount ELSE 0 END)/{CR_DIVISOR} AS asphalt,
  SUM(CASE WHEN d.channel IN ({_LUBEX_IN}) THEN -j.numAmount ELSE 0 END)/{CR_DIVISOR} AS lubex
FROM fin.tblAccountingJournal j
LEFT JOIN (
  SELECT intDeliveryId, intDistributionChannelId AS channel
  FROM sms.tbldeliveryheader
) d ON d.intDeliveryId = j.intDeliveryId
WHERE j.strGeneralLedgerCode = '{GL_SALES_LOCAL}' AND j.isActive = 1 AND j.intSBUId = {NXAB_ID}
  AND j.dteTransactionDate >= ? AND j.dteTransactionDate < ?
"""

# ---------------------------------------------------------------------------
# Delivery volume per SBU per UOM (raw quantity, no unit conversion).
#
# Join key is intDeliveryId on BOTH header and row (not intDeliveryHeaderId),
# and the SBU identifier is intBusinessAreaId (there is no intSBUId column on
# the delivery header). Each SBU's dominant UOM is chosen downstream in
# _pull_volume; the scorecard shows the numeric value + its UOM.
#
# Param order: rd, month_start, rd+1
# ---------------------------------------------------------------------------
VOLUME_SQL = """
SELECT h.intBusinessAreaId AS sbu,
       r.strUOM AS uom,
       SUM(CASE WHEN CAST(h.dteDeliveryDate AS DATE) = ? THEN r.numQuantity ELSE 0 END) AS daily,
       SUM(r.numQuantity) AS mtd
FROM sms.tbldeliveryheader h
JOIN sms.tbldeliveryrow r ON r.intDeliveryId = h.intDeliveryId
WHERE h.isActive = 1 AND r.isActive = 1
  AND h.dteDeliveryDate >= ? AND h.dteDeliveryDate < ?
GROUP BY h.intBusinessAreaId, r.strUOM
"""

# ---------------------------------------------------------------------------
# Marketing spend (GL 4210001) per SBU — actuals, NET of reversals.
#
# Marketing expense is a debit (positive numAmount), but the ERP also posts
# matching credit reversals ("Auto provision adjustment for daily net profit")
# that must net out. We therefore sum numAmount WITHOUT a sign filter (contrast
# revenue, which is credit and summed as -numAmount). Restricts to report-scope
# SBUs (SORTED_SBU_IDS) and remaps intSBUId=0 -> NXCM(58) like every other
# query, so the FK to sbu holds.
#
# Param order: month_start, rd+1, prev_start, prev_end, yoy_start, yoy_end,
#              fy_start, rd+1
# ---------------------------------------------------------------------------
MARKETING_SPEND_SQL = f"""
SELECT CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END AS sbu,
  SUM(CASE WHEN j.dteTransactionDate >= ? AND j.dteTransactionDate < ? THEN j.numAmount/{CR_DIVISOR} ELSE 0 END) AS mtd,
  SUM(CASE WHEN j.dteTransactionDate >= ? AND j.dteTransactionDate < ? THEN j.numAmount/{CR_DIVISOR} ELSE 0 END) AS mom,
  SUM(CASE WHEN j.dteTransactionDate >= ? AND j.dteTransactionDate < ? THEN j.numAmount/{CR_DIVISOR} ELSE 0 END) AS yoy,
  SUM(CASE WHEN j.dteTransactionDate >= ? AND j.dteTransactionDate < ? THEN j.numAmount/{CR_DIVISOR} ELSE 0 END) AS fy_ytd
FROM fin.tblAccountingJournal j
WHERE j.strGeneralLedgerCode = '{GL_MARKETING}' AND j.isActive = 1
  AND j.intSBUId NOT IN ({_RECON_EXCL})
  AND CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END IN ({_SKU_SBU_IN})
GROUP BY CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END
ORDER BY sbu
"""

# ---------------------------------------------------------------------------
# Marketing spend SubGL purpose breakdown (GL 4210001). One row per
# (sbu, subgl) for the MTD window so the tab can answer "what is this
# month's spend made of". Same remap/scope/debit rules as
# MARKETING_SPEND_SQL. strSubGlCode can be NULL on a handful of rows, so
# coalesce it to a stable sentinel rather than dropping the spend.
#
# Param order: month_start, rd+1
# ---------------------------------------------------------------------------
MARKETING_SPEND_DETAIL_SQL = f"""
SELECT CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END AS sbu,
  ISNULL(NULLIF(j.strSubGlCode, ''), '-') AS subgl_code,
  ISNULL(NULLIF(j.strSubGLName, ''), 'Unclassified') AS subgl_name,
  SUM(j.numAmount/{CR_DIVISOR}) AS mtd
FROM fin.tblAccountingJournal j
WHERE j.strGeneralLedgerCode = '{GL_MARKETING}' AND j.isActive = 1
  AND j.intSBUId NOT IN ({_RECON_EXCL})
  AND CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END IN ({_SKU_SBU_IN})
  AND j.dteTransactionDate >= ? AND j.dteTransactionDate < ?
GROUP BY CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END,
  ISNULL(NULLIF(j.strSubGlCode, ''), '-'),
  ISNULL(NULLIF(j.strSubGLName, ''), 'Unclassified')
ORDER BY sbu, mtd DESC
"""

# ---------------------------------------------------------------------------
# Marketing spend monthly series (GL 4210001). One row per (sbu, month) over
# a trailing window, so the tab can draw a spend trend line (the visual that
# explains the "Spend MoM" column). period_month is the first day of the
# month.
#
# Param order: from, to
# ---------------------------------------------------------------------------
MARKETING_SPEND_MONTHLY_SQL = f"""
SELECT CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END AS sbu,
  DATEFROMPARTS(YEAR(j.dteTransactionDate), MONTH(j.dteTransactionDate), 1) AS period_month,
  SUM(j.numAmount/{CR_DIVISOR}) AS spend
FROM fin.tblAccountingJournal j
WHERE j.strGeneralLedgerCode = '{GL_MARKETING}' AND j.isActive = 1
  AND j.intSBUId NOT IN ({_RECON_EXCL})
  AND CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END IN ({_SKU_SBU_IN})
  AND j.dteTransactionDate >= ? AND j.dteTransactionDate < ?
GROUP BY CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END,
  DATEFROMPARTS(YEAR(j.dteTransactionDate), MONTH(j.dteTransactionDate), 1)
ORDER BY sbu, period_month
"""

# ---------------------------------------------------------------------------
# Campaign-able marketing spend (GL 4210001 less non-campaign SubGL). Mirrors
# romi.py's "pool": excludes trade/people/overhead SubGL by keyword so the
# Marketing tab's spend baseline lines up with the ROMI campaign pool. SubGL
# names with a NULL/empty value are treated as campaign-able (same as romi.py).
# Param order matches MARKETING_SPEND_SQL / MARKETING_SPEND_MONTHLY_SQL.
# ---------------------------------------------------------------------------
_NON_CAMPAIGN_COND = " OR ".join(
    f"LOWER(ISNULL(NULLIF(j.strSubGLName, ''), '')) LIKE '%{k}%'"
    for k in NON_CAMPAIGN_SUBGL_KEYWORDS
)

MARKETING_SPEND_CAMPAIGNABLE_SQL = f"""
SELECT CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END AS sbu,
  SUM(CASE WHEN j.dteTransactionDate >= ? AND j.dteTransactionDate < ? THEN j.numAmount/{CR_DIVISOR} ELSE 0 END) AS mtd,
  SUM(CASE WHEN j.dteTransactionDate >= ? AND j.dteTransactionDate < ? THEN j.numAmount/{CR_DIVISOR} ELSE 0 END) AS mom,
  SUM(CASE WHEN j.dteTransactionDate >= ? AND j.dteTransactionDate < ? THEN j.numAmount/{CR_DIVISOR} ELSE 0 END) AS yoy,
  SUM(CASE WHEN j.dteTransactionDate >= ? AND j.dteTransactionDate < ? THEN j.numAmount/{CR_DIVISOR} ELSE 0 END) AS fy_ytd
FROM fin.tblAccountingJournal j
WHERE j.strGeneralLedgerCode = '{GL_MARKETING}' AND j.isActive = 1
  AND NOT ({_NON_CAMPAIGN_COND})
  AND j.intSBUId NOT IN ({_RECON_EXCL})
  AND CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END IN ({_SKU_SBU_IN})
GROUP BY CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END
ORDER BY sbu
"""

MARKETING_SPEND_MONTHLY_CAMPAIGNABLE_SQL = f"""
SELECT CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END AS sbu,
  DATEFROMPARTS(YEAR(j.dteTransactionDate), MONTH(j.dteTransactionDate), 1) AS period_month,
  SUM(j.numAmount/{CR_DIVISOR}) AS spend
FROM fin.tblAccountingJournal j
WHERE j.strGeneralLedgerCode = '{GL_MARKETING}' AND j.isActive = 1
  AND NOT ({_NON_CAMPAIGN_COND})
  AND j.intSBUId NOT IN ({_RECON_EXCL})
  AND CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END IN ({_SKU_SBU_IN})
  AND j.dteTransactionDate >= ? AND j.dteTransactionDate < ?
GROUP BY CASE WHEN j.intSBUId = {SBU_UNALLOCATED} THEN {SBU_ACCL} ELSE j.intSBUId END,
  DATEFROMPARTS(YEAR(j.dteTransactionDate), MONTH(j.dteTransactionDate), 1)
ORDER BY sbu, period_month
"""

# ---------------------------------------------------------------------------
# Item/SKU-level delivery quantity (Advanced Analysis). Same join key as
# VOLUME_SQL (intDeliveryId on BOTH header and row), grouped down to item.
# Restricts to the report-scope SBUs (SORTED_SBU_IDS): the delivery header's
# intBusinessAreaId also carries non-report business areas (e.g. 65) that are
# absent from the sbu dimension and would otherwise break the FK.
# Param order: from, to (delivery date window).
# ---------------------------------------------------------------------------
SKU_QUANTITY_SQL = f"""
SELECT h.intBusinessAreaId AS sbu,
       r.intItemId AS item_id,
       r.strUOM AS uom,
       CAST(h.dteDeliveryDate AS DATE) AS d,
       SUM(r.numQuantity) AS quantity
FROM sms.tbldeliveryheader h
JOIN sms.tbldeliveryrow r ON r.intDeliveryId = h.intDeliveryId
WHERE h.isActive = 1 AND r.isActive = 1
  AND r.intItemId IS NOT NULL
  AND h.intBusinessAreaId IN ({_SKU_SBU_IN})
  AND h.dteDeliveryDate >= ? AND h.dteDeliveryDate < ?
GROUP BY h.intBusinessAreaId, r.intItemId, r.strUOM, CAST(h.dteDeliveryDate AS DATE)
ORDER BY h.intBusinessAreaId, r.intItemId, CAST(h.dteDeliveryDate AS DATE)
"""

# ---------------------------------------------------------------------------
# Item master (SKU dimension) for readable SKU names in the ABC table.
# Fetches only the items that actually appear in sales (the full itm.tblItem
# table is ~180k rows — far too many to page over the gateway's 500-row limit).
# The caller chunks item_ids and passes each chunk here; ids are integers so
# inlining them into the IN list is safe.
# ---------------------------------------------------------------------------
def item_master_sql(item_ids: list[int]) -> str:
    ids = ",".join(str(int(i)) for i in item_ids)
    return f"""
SELECT i.intItemId AS item_id,
       i.strItemCode AS item_code,
       i.strItemName AS item_name,
       i.intItemCategoryId AS category_id,
       c.strItemCategoryName AS category_name
FROM itm.tblItem i
LEFT JOIN itm.tblItemCategory c ON c.intItemCategoryId = i.intItemCategoryId
WHERE i.isActive = 1 AND i.intItemId IN ({ids})
ORDER BY i.intItemId
"""
