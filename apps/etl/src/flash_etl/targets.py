"""Monthly SBU revenue targets.

Source of truth is now ``public.target`` (seeded by migration 00028): the
scheduled pipeline reads targets from the DB and has no Google Sheets
dependency at runtime. A standalone ``sync_targets_from_sheets()`` remains for
manually refreshing the DB from the tracker sheet when the plan changes.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from datetime import date, datetime

import structlog

from .config import Settings
from .db import supabase_conn, supabase_query
from .models import Target

log = structlog.get_logger()

DEFAULT_SPREADSHEET_ID = "1kf-2lI17nMgHx2bXAvwwx9PWboZ09qFmKP7NCR5hX3A"

# Tracker SBU name -> (sbu_id, channel).
_NAME_MAP: dict[str, tuple[int, str]] = {
    "NXST": (102, "default"),
    "NXCM": (58, "default"),
    "NXES": (36, "default"),
    "NXRM": (69, "default"),
    "NXOR": (126, "default"),
    "NXAF": (109, "default"),
    "Lubex": (98, "lubex"),
    "NXAL": (99, "default"),
    "NXLE": (114, "default"),
    "NXNT": (91, "default"),
    "NXPL": (19, "default"),
    "NXAB_Asphalt": (98, "asphalt"),
    "NXIT": (84, "default"),
    "NXBP": (83, "default"),
    "NXCL1": (72, "default"),
    "NXCL2": (77, "default"),
    "BTL_G2G": (72, "default"),
    "DTL_G2G": (77, "default"),
    "NXAI": (115, "default"),
    "NXEF": (120, "default"),
    "NXBL": (124, "default"),
    "NXHM": (86, "default"),
}


def fetch_all_targets(settings: Settings) -> dict[date, dict[tuple[int, str], Target]]:
    """Return {period_month: {(sbu_id, channel): Target}} read from public.target.

    Revenue-only: the DB is seeded from the tracker's Target Value (Cr) column
    with volume targets intentionally left null.
    """
    rows = supabase_query(
        settings,
        "select sbu_id, period_month, channel, mo_target_rev, mo_target_vol "
        "from public.target",
    )
    targets: dict[date, dict[tuple[int, str], Target]] = {}
    for r in rows:
        month = r["period_month"]
        if isinstance(month, datetime):
            month = month.date()
        rev = float(r["mo_target_rev"]) if r["mo_target_rev"] is not None else None
        vol = float(r["mo_target_vol"]) if r["mo_target_vol"] is not None else None
        key = (int(r["sbu_id"]), (r["channel"] or "default"))
        targets.setdefault(month, {})[key] = Target(mo_rev=rev, mo_vol=vol)

    log.info("loaded targets from db", months=len(targets))
    return targets


def targets_for_month(
    all_targets: dict[date, dict[tuple[int, str], Target]],
    rd: date,
) -> dict[tuple[int, str], Target]:
    """Return the {(sbu_id, channel): Target} map for the month containing rd."""
    return all_targets.get(rd.replace(day=1), {})


# ---------------------------------------------------------------------------
# Opt-in re-sync from the Google Sheet (NOT run by the pipeline)
# ---------------------------------------------------------------------------

def sync_targets_from_sheets(settings: Settings) -> int:
    """One-time admin helper: re-seed public.target from the tracker sheet.

    Pulls the Target_Input sheet, maps SBU names to (sbu_id, channel) and
    writes revenue-only targets (volume deliberately ignored). Delete-then-
    insert per month so months that dropped from the sheet show no target.
    """
    sheet_targets = _fetch_from_sheet(settings)
    if not sheet_targets:
        log.warning("no targets read from sheet; nothing synced")
        return 0

    sql = """
    INSERT INTO public.target (sbu_id, period_month, channel, mo_target_rev)
    VALUES (%s, %s, %s, %s)
    ON CONFLICT (sbu_id, period_month, channel) DO UPDATE SET
      mo_target_rev = EXCLUDED.mo_target_rev,
      mo_target_vol = NULL
    """
    total = 0
    with supabase_conn(settings) as conn:
        with conn.cursor() as cur:
            for period_month, month_targets in sheet_targets.items():
                cur.execute(
                    "DELETE FROM public.target WHERE period_month = %s",
                    (period_month,),
                )
                rows = [
                    (sbu_id, period_month, channel, t.mo_rev)
                    for (sbu_id, channel), t in month_targets.items()
                ]
                if rows:
                    cur.executemany(sql, rows)
                    total += len(rows)
        conn.commit()

    log.info("synced revenue targets from sheet", months=len(sheet_targets), count=total)
    return total


def _parse_month(key: str) -> date | None:
    """Parse a tracker month key ('Jul-26', 'Jul-2025', 'Sep-2026') -> first of month."""
    k = key.strip()
    for fmt in ("%b-%y", "%b-%Y", "%b %y", "%b %Y"):
        try:
            return datetime.strptime(k, fmt).date().replace(day=1)
        except ValueError:
            continue
    return None


def _parse_num(v: str | None) -> float | None:
    if v is None:
        return None
    v = v.strip().replace(",", "")
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        log.warning("unparseable target cell", value=v)
        return None


def _add(a: float | None, b: float | None) -> float | None:
    if a is None:
        return b
    if b is None:
        return a
    return a + b


def _access_token(sa_path: str) -> str:
    try:
        from google.auth.transport import requests as ga_requests  # noqa: F401
        from google.oauth2 import service_account
    except ImportError as exc:  # pragma: no cover - degraded mode
        log.warning("google-auth not installed; skipping targets", error=str(exc))
        raise RuntimeError("google-auth unavailable") from exc

    scopes = [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/spreadsheets.readonly",
    ]
    creds = service_account.Credentials.from_service_account_file(sa_path, scopes=scopes)
    creds.refresh(ga_requests.Request())
    return creds.token


def _fetch_from_sheet(settings: Settings) -> dict[date, dict[tuple[int, str], Target]]:
    """Read the tracker's Target_Input sheet (revenue-only) into a target map."""
    if not settings.sheets_sa_path:
        log.warning("sheets_sa_path not configured; no targets")
        return {}

    sheet_id = settings.sheets_spreadsheet_id or DEFAULT_SPREADSHEET_ID
    sheet = urllib.parse.quote(settings.sheets_range or "Target_Input")
    url = (
        f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/"
        f"{sheet}!A1:D500"
    )
    token = _access_token(settings.sheets_sa_path)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        rows = json.loads(resp.read().decode()).get("values", [])

    targets: dict[date, dict[tuple[int, str], Target]] = {}
    for r in rows[1:]:
        if not r or len(r) < 2 or not r[0]:
            continue
        month = _parse_month(r[0])
        if month is None:
            continue
        mapped = _NAME_MAP.get(r[1].strip())
        if mapped is None:
            continue
        rev = _parse_num(r[3] if len(r) > 3 else None)
        if rev is None:
            continue
        month_map = targets.setdefault(month, {})
        t = month_map.setdefault(mapped, Target())
        t.mo_rev = _add(t.mo_rev, rev)

    log.info("fetched targets from sheet", months=len(targets))
    return targets
