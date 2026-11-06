"""Validation: DWH sync-health gate + regression guards.

The regression guards encode the "permanently-fixed bugs" so they surface
as loud warnings instead of silent data corruption.
"""

from __future__ import annotations

from datetime import datetime

import structlog

from .constants import RECON_ONLY_SBUS
from .dates import DateContext
from .models import Snapshot, SyncHealth

log = structlog.get_logger()

# Major SBUs that should essentially never be zero-revenue on a trading day.
_MAJOR_SBUS = {36, 58, 102, 109, 86, 69, 91}

_VALID_MOMENTUM = {"Strong +", "Positive", "Neutral", "Weak", "Negative", "N/A"}


def check_sync_health(
    latest_post: datetime | None,
    now: datetime,
    stall_hours: float,
    report_date,
) -> SyncHealth:
    if latest_post is None:
        return SyncHealth(latest_post=None, lag_hours=None, is_stalled=False,
                          reason="no GL 3010001 rows in window")
    lag = (now - latest_post).total_seconds() / 3600.0
    is_stalled = lag > stall_hours
    return SyncHealth(
        latest_post=latest_post,
        lag_hours=lag,
        is_stalled=is_stalled,
        reason=f"lag {lag:.1f}h > {stall_hours}h" if is_stalled else "",
    )


def run_regression_checks(snapshots: list[Snapshot], ctx: DateContext) -> list[str]:
    issues: list[str] = []
    snap_by_id = {s.sbu_id: s for s in snapshots if s.channel == "default"}

    # 1. SBU-0 remap must have happened (no unallocated SBU should survive).
    if any(s.sbu_id == 0 for s in snapshots):
        issues.append("SBU-0 rows present — intSBUId=0 remap to NXCM(58) failed.")

    # 2. Recon-only entities must NOT be in the report scope.
    leaked = RECON_ONLY_SBUS & set(snap_by_id)
    if leaked:
        issues.append(f"Recon-only entities leaked into report scope: {sorted(leaked)}")

    # 3. Major SBUs should not be silently zero.
    for sbu_id in _MAJOR_SBUS:
        s = snap_by_id.get(sbu_id)
        if s is None:
            issues.append(f"Major SBU {sbu_id} missing from snapshots.")
        elif s.mtd_rev <= 0:
            issues.append(f"Major SBU {sbu_id} has zero MTD revenue — investigate.")

    # 4. Momentum must be a known value.
    for s in snapshots:
        if s.momentum not in _VALID_MOMENTUM:
            issues.append(f"SBU {s.sbu_id} has invalid momentum '{s.momentum}'.")

    # 5. Target stale-date guard: mtd target must use current days_elapsed.
    for s in snapshots:
        if s.mo_tgt_rev is not None and s.mtd_tgt_rev is not None:
            expected = round(s.mo_tgt_rev * ctx.month_factor, 6)
            if abs(expected - s.mtd_tgt_rev) > 0.011:
                issues.append(
                    f"SBU {s.sbu_id} MTD target stale: {s.mtd_tgt_rev} vs expected {expected}"
                )

    return issues
